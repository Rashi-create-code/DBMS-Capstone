// Turns validation / MongoDB errors into clean HTTP responses
module.exports = (err, _req, res, _next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate entry: that record already exists' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join('; ') });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid value for ' + err.path });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
