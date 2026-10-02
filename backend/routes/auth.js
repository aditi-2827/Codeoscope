// backend/routes/auth.js
// Lightweight validation endpoints. Real authentication stays with Supabase.
const express = require('express');
const {
  normalizeEmail,
  isValidName,
  isValidEmailFormat,
  isDisposableEmail,
  isValidPassword,
  cleanName,
} = require('../lib/validators');

const router = express.Router();

// POST /api/auth/validate-email  { email }  -> { valid, reason? }
router.post('/validate-email', (req, res) => {
  const email = normalizeEmail((req.body && req.body.email) || '');
  if (!isValidEmailFormat(email)) {
    return res.json({ valid: false, reason: 'Enter a valid email address (e.g. name@domain.com).' });
  }
  if (isDisposableEmail(email)) {
    return res.json({ valid: false, reason: 'Disposable or temporary email addresses are not allowed.' });
  }
  res.json({ valid: true });
});

// POST /api/auth/validate-signup  { firstName, lastName, email, password } -> { valid, errors }
router.post('/validate-signup', (req, res) => {
  const b = req.body || {};
  const errors = {};
  const email = normalizeEmail(b.email || '');

  if (!isValidName(b.firstName)) errors.firstName = 'Enter a valid first name (letters only, 2+ chars).';
  if (!isValidName(b.lastName)) errors.lastName = 'Enter a valid last name (letters only, 2+ chars).';
  if (!isValidEmailFormat(email)) errors.email = 'Enter a valid email address (e.g. name@domain.com).';
  else if (isDisposableEmail(email)) errors.email = 'Disposable or temporary email addresses are not allowed.';
  if (!isValidPassword(b.password)) errors.password = 'Password must be 8-72 chars with at least one letter and one number.';

  res.json({
    valid: Object.keys(errors).length === 0,
    errors,
    clean: {
      firstName: cleanName(b.firstName),
      lastName: cleanName(b.lastName),
      email,
    },
  });
});

module.exports = router;