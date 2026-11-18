import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('3. In-Clinic Appointment Bookings Workflow (/api/admin/appointments/*)', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);
  let createdAppointmentId = null;
  // 11:00 AM IST on Wednesday Nov 25 2026 is 05:30:00 UTC
  const testStartsAt = '2026-11-25T05:30:00.000Z';
  const testDate = '2026-11-25';

  it('GET /api/admin/appointments rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/appointments`);
    assert.equal(res.status, 401);
  });

  it('PUT /api/admin/appointments/schedule configures clinic operating hours & sessions', async () => {
    const schedulePayload = {
      timezone: 'Asia/Kolkata',
      booking_window_days: 30,
      slot_interval_minutes: 30,
      appointment_duration_minutes: 30,
      weekly_closed_weekdays: [7], // Sunday closed
      sessions: [
        { label: 'Morning OPD', opens_at: '10:00', closes_at: '13:00' },
        { label: 'Evening OPD', opens_at: '16:00', closes_at: '19:00' },
      ],
      appointment_services: ['In-Clinic Hair Trichology Consultation'],
      clinic_name: 'Dr. Hair Flagship Clinic',
      doctor_name: 'Dr. Jai Bansal',
      room: 'Consultation Suite 1',
      clinic_address: 'Defence Colony, New Delhi',
    };

    const putRes = await fetch(`${BASE_URL}/api/admin/appointments/schedule`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(schedulePayload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.status, 'success');
    assert.equal(putBody.data?.is_configured, true);
  });

  it('GET /api/admin/appointments/schedule fetches active clinic schedule configuration', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/appointments/schedule`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data?.is_configured);
    assert.equal(body.data.sessions.length, 2);
  });

  it('GET & PUT /api/admin/appointments/billing manages consultation fee & billing toggle', async () => {
    const putRes = await fetch(`${BASE_URL}/api/admin/appointments/billing`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        consultation_fee: 650,
        payment_required: true,
        first_appointment_free: false,
      }),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.status, 'success');
    assert.equal(putBody.data?.consultation_fee, 650);
  });

  it('Manages clinic closed dates (add holiday and reopen date)', async () => {
    const holidayDate = `2026-12-${String(Math.floor(Math.random() * 20) + 10)}`;

    // Add holiday
    const addRes = await fetch(`${BASE_URL}/api/admin/appointments/closed-dates`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        date: holidayDate,
        reason: 'Special Clinic Renovation',
      }),
    });
    assert.ok([200, 201].includes(addRes.status), `Expected 200/201, got ${addRes.status}`);

    // List closed dates
    const listRes = await fetch(`${BASE_URL}/api/admin/appointments/closed-dates`, {
      headers: authHeaders,
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    const items = listBody.data?.items || listBody.data || [];
    const dateStrings = items.map((item) => (typeof item === 'string' ? item : item.date));
    assert.ok(dateStrings.includes(holidayDate), 'Holiday date should be in closed dates list');

    // Reopen date
    const delRes = await fetch(`${BASE_URL}/api/admin/appointments/closed-dates/${holidayDate}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(delRes.status, 200);
  });

  it('POST /api/admin/appointments schedules a new in-clinic appointment', async () => {
    const usersRes = await fetch(`${BASE_URL}/api/admin/users?limit=1`, { headers: authHeaders });
    const usersBody = await usersRes.json();
    const patient = usersBody.data?.items?.[0];
    assert.ok(patient?.id, 'Patient required for booking');

    const appointmentPayload = {
      patient_id: patient.id,
      starts_at: testStartsAt,
      reason: 'In-Clinic Hair Trichology Consultation',
      source: 'Phone',
      payment_method: 'Pay at clinic',
      payment_status: 'Pending',
      consultation_fee: 650,
    };

    const res = await fetch(`${BASE_URL}/api/admin/appointments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(appointmentPayload),
    });
    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'success');
    createdAppointmentId = body.data?.id || body.data?.appointment_id;
    assert.ok(createdAppointmentId, 'Created appointment ID should exist');
  });

  it('GET /api/admin/appointments lists appointments and verifies newly created appointment', async () => {
    assert.ok(createdAppointmentId, 'Created appointment ID required');
    const res = await fetch(`${BASE_URL}/api/admin/appointments`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const items = body.data?.items || body.data || [];
    assert.ok(Array.isArray(items));
    const found = items.find((appt) => String(appt.id) === String(createdAppointmentId));
    assert.ok(found, 'Should find newly scheduled appointment');
  });

  it('PATCH /api/admin/appointments/:id confirms and marks payment for appointment', async () => {
    assert.ok(createdAppointmentId, 'Appointment ID required');
    const res = await fetch(`${BASE_URL}/api/admin/appointments/${createdAppointmentId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'Arrived',
        payment_status: 'Paid',
        payment_method: 'Cash',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
  });

  it('PATCH /api/admin/appointments/:id cancels appointment with documented reason', async () => {
    assert.ok(createdAppointmentId, 'Appointment ID required');
    const res = await fetch(`${BASE_URL}/api/admin/appointments/${createdAppointmentId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'Cancelled',
        cancellation_reason: 'Doctor emergency surgery rescheduling',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
  });
});
