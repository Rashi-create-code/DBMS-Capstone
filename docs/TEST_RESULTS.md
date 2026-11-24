# SmartStay (MongoDB) - Test Results

Run on 2026-11-24 against MongoDB 7. **72 of 72 tests passed.**

| # | Group | Test | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | Attendance | Valid Present entry (on time) | Accepted | Accepted (HTTP 201) | PASS |
| 2 | Attendance | Boundary: check-in exactly 09:15 is Present | Accepted | Accepted (HTTP 201) | PASS |
| 3 | Attendance | Boundary: 09:16 marked Late | Accepted | Accepted (HTTP 201) | PASS |
| 4 | Attendance | Duplicate entry same employee + date | Rejected (duplicate) | Rejected (HTTP 400): Attendance error: duplicate entry for this employee and date | PASS |
| 5 | Attendance | Boundary: 09:16 marked Present | Rejected (must be Late) | Rejected (HTTP 400): Attendance error: check-in after 09:15 must be marked Late | PASS |
| 6 | Attendance | Check-out before check-in | Rejected | Rejected (HTTP 400): Attendance error: check-out must be after check-in | PASS |
| 7 | Attendance | Absent with check-in time | Rejected | Rejected (HTTP 400): Attendance error: Absent record cannot have check-in/out | PASS |
| 8 | Attendance | Present without check-in | Rejected | Rejected (HTTP 400): Attendance error: check-in time is required | PASS |
| 9 | Attendance | Future date | Rejected | Rejected (HTTP 400): Attendance error: future dates are not allowed | PASS |
| 10 | Attendance | Sunday (weekly off) | Rejected | Rejected (HTTP 400): Attendance error: Sunday is the weekly off | PASS |
| 11 | Attendance | Date before joining date | Rejected | Rejected (HTTP 400): Attendance error: date is before joining date | PASS |
| 12 | Attendance | Present on an approved-leave day | Rejected | Rejected (HTTP 400): Attendance error: employee is on approved leave that day | PASS |
| 13 | Leave | Overlapping request over approved leave | Rejected (overlap) | Rejected (HTTP 400): Leave error: dates overlap an already approved leave | PASS |
| 14 | Leave | Boundary: starts the day after approved leave ends | Accepted | Accepted (HTTP 201) | PASS |
| 15 | Leave | Boundary: overlaps only on the last day | Rejected (overlap) | Rejected (HTTP 400): Leave error: dates overlap an already approved leave | PASS |
| 16 | Leave | End date before start date | Rejected | Rejected (HTTP 400): Leave error: end date is before start date | PASS |
| 17 | Leave | Same overlapping dates, different employee | Accepted | Accepted (HTTP 201) | PASS |
| 18 | Leave | Employee cannot choose the status of own request | Saved as Pending | HTTP 201, status Pending | PASS |
| 19 | Payroll | Negative basic salary | Rejected | Rejected (HTTP 400): basicSalary must be at least 0.01 | PASS |
| 20 | Payroll | Negative salary stopped by the schema too (second line of defence) | Rejected by database schema | employee validation failed: basic_salary: basic_salary must be greater than zero | PASS |
| 21 | Payroll | Boundary: zero basic salary | Rejected | Rejected (HTTP 400): basicSalary must be at least 0.01 | PASS |
| 22 | Payroll | Boundary: smallest valid salary 0.01 | Accepted | Accepted (HTTP 201) | PASS |
| 23 | Payroll | Tax at slab edge (20000/month = 2,40,000/yr) | Tax = 0 | tax = 0 | PASS |
| 24 | Payroll | Tax just above edge (20100/month) | Tax = 5.00 | tax = 5 | PASS |
| 25 | Payroll | Tax for 38000/month (2 slabs) | Tax = 900.00 | tax = 900 | PASS |
| 26 | Payroll | Negative annual income | Rejected | Annual income cannot be negative | PASS |
| 27 | Payroll | Generate payroll for current (unfinished) month | Rejected | Rejected (HTTP 400): Payroll error: month is not finished yet | PASS |
| 28 | Payroll | Generate again for finished month (no duplicates) | rows_generated 0, rows_skipped 12 | {"rows_generated":0,"rows_skipped":12,"pay_month":"2026-10-01"} | PASS |
| 29 | Payroll | Recalculate with overwrite (same results, still 12 rows) | rows_generated 12 | net total before 224611.11, after 224611.11 | PASS |
| 30 | Payroll | Net salary never exceeds basic salary | No rows violate | 0 violating rows | PASS |
| 31 | Transactions | ROLLBACK: valid payroll row followed by an invalid one | Nothing saved | rows before 36, after 36 | PASS |
| 32 | Transactions | COMMIT: payroll result is persisted | 12 rows exist for last month | 12 rows | PASS |
| 33 | Rooms | Allocate tenant into a full room | Rejected (capacity) | Rejected (HTTP 400): Allocation error: room is already at full capacity | PASS |
| 34 | Rooms | Tenant who already has an active room | Rejected | Rejected (HTTP 400): Allocation error: tenant already has an active room | PASS |
| 35 | Rooms | Boundary: last free bed in a 4-sharing room | Accepted | Accepted (HTTP 201) | PASS |
| 36 | Rooms | Boundary: fill the last bed, then one more | Rejected | Rejected (HTTP 400): Allocation error: room is already at full capacity | PASS |
| 37 | Rooms | Two admins take the same last bed at the same time | Exactly one succeeds | results: HTTP 201 and HTTP 400 | PASS |
| 38 | Rent | Duplicate rent record for same month | Rejected | Rejected: duplicate key | PASS |
| 39 | Rent | Record payment without a payment date | HTTP 400 | Rejected (HTTP 400): paymentDate is required | PASS |
| 40 | Rent | Pay a rent record that does not exist | HTTP 404 | Rejected (HTTP 404): No pending rent record with this id | PASS |
| 41 | Access | Admin login with correct password | HTTP 200 + token | token received | PASS |
| 42 | Access | Login with wrong password | HTTP 401 | Rejected (HTTP 401): Wrong username or password | PASS |
| 43 | Access | Login with empty fields | HTTP 400 | Rejected (HTTP 400): username is required | PASS |
| 44 | Access | NoSQL injection in login ({"$gt":""}) | HTTP 401, no token | HTTP 401 | PASS |
| 45 | Access | Admin API without token | HTTP 401 | Rejected (HTTP 401): Please log in | PASS |
| 46 | Access | Admin API with a forged token | HTTP 401 | Rejected (HTTP 401): Session expired, please log in again | PASS |
| 47 | Access | Employee calls admin employee list | HTTP 403 | Rejected (HTTP 403): You are not allowed to do this | PASS |
| 48 | Access | Employee calls admin payroll generate | HTTP 403 | Rejected (HTTP 403): You are not allowed to do this | PASS |
| 49 | Access | Employee tries to approve a leave request | HTTP 403 | Rejected (HTTP 403): You are not allowed to do this | PASS |
| 50 | Access | Admin calls employee self-service route | HTTP 403 | Rejected (HTTP 403): You are not allowed to do this | PASS |
| 51 | Access | Employee sees only own salary slips | All rows belong to employee 3 | 3 slips, ids: 3 | PASS |
| 52 | Access | Employee tries ?employeeId=2 to read another slip | Still own data only | ids: 3 | PASS |
| 53 | Access | Employee reads own attendance | HTTP 200, own rows | 27 rows | PASS |
| 54 | Access | Employee submits a leave request (valid) | HTTP 201, status Pending | HTTP 201, status Pending | PASS |
| 55 | Validation | Create employee with invalid phone | HTTP 400 | Rejected (HTTP 400): phone must be a valid 10-digit mobile number | PASS |
| 56 | Transactions | Employee + login are atomic (duplicate username) | HTTP 409, no orphan employee | HTTP 409, employees left behind: 0 | PASS |
| 57 | Validation | Duplicate attendance through the API | HTTP 400 | Rejected (HTTP 400): Attendance error: duplicate entry for this employee and date | PASS |
| 58 | Validation | Payroll month in bad format | HTTP 400 | Rejected (HTTP 400): month must look like 2026-10 | PASS |
| 59 | Validation | Room with capacity 7 (above limit) | HTTP 400 | Rejected (HTTP 400): capacity must be at most 6 | PASS |
| 60 | Validation | NoSQL injection text in property search | HTTP 200, no rows, no error | HTTP 200/200, 0/0 rows | PASS |
| 61 | Validation | Complaint from unknown phone number | HTTP 400 | Rejected (HTTP 400): No current tenant found for this phone number | PASS |
| 62 | Enquiry | Visitor sends a valid enquiry | HTTP 201, status New | HTTP 201, status New | PASS |
| 63 | Enquiry | Enquiry with invalid phone number | HTTP 400 | Rejected (HTTP 400): phone must be a valid 10-digit mobile number | PASS |
| 64 | Enquiry | Enquiry with empty message | HTTP 400 | Rejected (HTTP 400): message is required | PASS |
| 65 | Public | Filter "Any" (sharing=0) lists every PG | HTTP 200, all 5 properties | HTTP 200, 5 properties | PASS |
| 66 | Public | Sharing filter returns only matching rooms | Every returned room is a Double | 5 properties, 10 double rooms | PASS |
| 67 | Public | Property search filter: Rohtak + max rent 5000 | Returns Rohtak property | SmartStay Rohtak MDU | PASS |
| 68 | Public | Public response has no admin data | No salary/phone fields | fields: property_id, name, address, area, city, state, pin_code, latitude, longitude, description, min_rent, max_rent, total_beds, available_beds, facilities, match_rooms, match_beds, match_min_rent, matching_rooms | PASS |
| 69 | Public | Coordinates come from the database | Golf Course Road at 28.4335, 77.103 | SmartStay Golf Course Road 28.4335, 77.103 | PASS |
| 70 | Tenants | Tenant list shows check-in and check-out for past stays | Vacated tenant has an end date | Nitin Kadian: 2026-03-04 to 2026-07-12 | PASS |
| 71 | Admin | Dashboard numbers match the data | properties 5, tenants 31, employees 12 | {"properties":5,"beds":75,"occupied":29,"tenants":31,"pendingRent":217900,"employees":12,"openComplaints":6,"pendingLeaves":2} | PASS |
| 72 | Admin | Admin portal has no enquiries page | HTTP 404 | Rejected (HTTP 404): Not found | PASS |
