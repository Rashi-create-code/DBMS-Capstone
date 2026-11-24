# SmartStay on MongoDB - design notes

The website and the API are identical to the MySQL version. Only the storage layer changed, so deployment is easy (MongoDB Atlas free tier + one Node server).

## Collections (16)
`property`, `facility`, `room`, `tenant`, `allocation`, `rent_payment`, `complaint`, `visitor`, `enquiry`, `designation`, `employee`, `user_account`, `attendance`, `leave_request`, `tax_slab`, `payroll` (+ `counters` for ids).
Every document has a small integer id (`property_id`, `room_id`, `employee_id` ...) from an atomic counter, so URLs and screens are the same as before.

## How the SQL ideas map to MongoDB
| MySQL version | MongoDB version |
|---|---|
| PK / AUTO_INCREMENT | integer id field + unique index, generated from the `counters` collection |
| FOREIGN KEY | id reference fields; existence checked before every write; deletes of used records refused (409) |
| `property_facility` junction table | `facility_ids` array inside the `property` document (embedding) |
| UNIQUE / CHECK constraints | unique indexes + Mongoose schema validation (min, max, enum, regex) |
| One active room per tenant | **partial unique index** on `allocation.tenant_id` where `status = 'Active'` |
| Triggers (attendance, leave, allocation) | `rules.js` validators run before every insert and update, same messages |
| `fn_monthly_tax`, `fn_working_days` ... | functions in `rules.js` (tax slabs still read from the `tax_slab` collection) |
| `sp_generate_payroll` with COMMIT/ROLLBACK | `generatePayroll()` writes all slips inside a **MongoDB transaction** (`withTx`); any error aborts everything |
| `FOR UPDATE` row lock on allocation | transaction that touches the room document first, so two admins cannot take the same last bed (tested) |
| Views (`v_room_availability`, `v_salary_slip` ...) | helper functions `roomAvailability`, `propertyPublic`, `salarySlips` |
| Indexes + EXPLAIN | compound indexes on `attendance(att_date,status)`, `payroll(pay_month)`, `rent_payment(rent_month,status)` etc.; use `.explain('executionStats')` |
| Three MySQL accounts | one Atlas user; separation is done by the API (JWT roles, employee id always taken from the token) |

## Same results as MySQL
Same sample data and same salary rules give identical numbers (for example Anil Chauhan's October slip: net ₹34,425.92; October payout total ₹2,24,611.11).

## Honest trade-offs
* The relational ideas (3NF, foreign keys, triggers, stored procedures) are replaced by their MongoDB equivalents above; they are enforced in the application layer instead of inside the database engine.
* Money is stored as numbers rounded to 2 decimals (use `Decimal128` for real accounting).
* Transactions need a replica set: Atlas always has one. A plain local `mongod` runs without them (a warning is printed); for local use start it with `--replSet rs0` (see README).
