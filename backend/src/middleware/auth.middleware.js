const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided. Please log in.' });

  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ error: 'Not authenticated.' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: `Access denied. Required: ${roles.join(', ')}` });
  next();
};

module.exports = { authenticate, authorize };