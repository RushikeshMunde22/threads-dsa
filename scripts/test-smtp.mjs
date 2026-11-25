import nodemailer from 'nodemailer';

const user = process.env.SMTP_EMAIL || process.env.SMTP_USER || '';
const pass = (process.env.SMTP_PASSWORD || '').replace(/^["']|["']$/g, '');

if (!user || !pass) {
  console.error('ERROR: SMTP_EMAIL and SMTP_PASSWORD environment variables are required.');
  process.exit(1);
}

console.log('Testing SMTP connection to smtp.gmail.com:465...');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user,
    pass,
  },
});

try {
  await transporter.verify();
  console.log('SUCCESS: SMTP connection and credentials verified successfully with Gmail!');
} catch (err) {
  console.error('ERROR verifying SMTP connection:', err.message);
  process.exit(1);
}
