const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const path = require('path');
const { spawn } = require('child_process');

// List of common disposable email domains
const disposableEmailDomains = [
  'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'throwaway.email', 'temp-mail.org', 'maildrop.cc', 'fakeinbox.com'
];

// Validate email format
const validateEmailFormat = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Check if email domain is disposable/temporary
const isDisposableEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableEmailDomains.includes(domain);
};

// Check if email domain has valid MX records (mail server exists)
const checkEmailDomain = async (email) => {
  try {
    const domain = email.split('@')[1];
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (error) {
    console.error(`❌ Domain check failed for ${email}:`, error.message);
    return false;
  }
};

// Comprehensive email validation before sending
const validateEmailBeforeSending = async (email) => {
  const errors = [];

  // 1. Check format
  if (!validateEmailFormat(email)) {
    errors.push('Invalid email format');
  }

  // 2. Check if disposable
  if (isDisposableEmail(email)) {
    errors.push('Disposable email addresses are not allowed');
  }

  // 3. Check if domain accepts emails
  const hasMailServer = await checkEmailDomain(email);
  if (!hasMailServer) {
    errors.push('Email domain does not accept emails');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

const getVerificationEmailContent = (code, name) => {
  const safeName = name || 'User';
  return {
    subject: 'Email Verification - Tuition Sir LMS',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content {
            background: #f9fafb;
            padding: 30px;
            border-radius: 0 0 10px 10px;
          }
          .code {
            background: white;
            border: 2px solid #2563eb;
            padding: 20px;
            text-align: center;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #2563eb;
            margin: 20px 0;
            border-radius: 8px;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Tuition Sir LMS!</h1>
            <p style="margin: 10px 0 0; font-size: 16px;">Science with Maleesha | Maleesha Sir Tuition</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <p>Thank you for registering with Tuition Sir Learning Management System. To complete your registration, please verify your email address using the code below:</p>
            
            <div class="code">${code}</div>
            
            <p>Enter this code in the verification page to activate your account.</p>
            
            <div class="warning">
              <strong>Important:</strong> This code will expire in 10 minutes. If you didn't request this verification, please ignore this email.
            </div>
            
            <div class="footer">
              <p>Best regards,<br><strong>Science with Maleesha | Maleesha Sir Tuition</strong></p>
              <p>Contact: +94 71 439 0924</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

const getPasswordResetEmailContent = (resetUrl, name) => {
  const safeName = name || 'User';
  return {
    subject: 'Password Reset - Tuition Sir LMS',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .cta-wrap { text-align: center; margin: 24px 0; }
          .cta {
            display: inline-block;
            background: #2563eb;
            color: white !important;
            text-decoration: none;
            padding: 12px 22px;
            border-radius: 8px;
            font-weight: bold;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
            <p style="margin: 10px 0 0; font-size: 16px;">Science with Maleesha | Maleesha Sir Tuition</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <p>We received a request to reset your Tuition Sir LMS password.</p>
            <div class="cta-wrap">
              <a class="cta" href="${resetUrl}">Reset Password</a>
            </div>
            <p>If the button does not work, use this link:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <div class="warning">
              <strong>Important:</strong> This reset link expires in 1 hour. If you did not request this, you can safely ignore this email.
            </div>
            <div class="footer">
              <p>Best regards,<br><strong>Science with Maleesha | Maleesha Sir Tuition</strong></p>
              <p>Contact: +94 71 439 0924</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

const getPasswordResetCodeEmailContent = (code, name) => {
  const safeName = name || 'User';
  return {
    subject: 'Password Reset Code - Tuition Sir LMS',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .code {
            background: white;
            border: 2px solid #2563eb;
            padding: 18px;
            text-align: center;
            font-size: 30px;
            font-weight: bold;
            letter-spacing: 6px;
            color: #2563eb;
            margin: 20px 0;
            border-radius: 8px;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Code</h1>
            <p style="margin: 10px 0 0; font-size: 16px;">Science with Maleesha | Maleesha Sir Tuition</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <p>Use the code below to reset your password:</p>
            <div class="code">${code}</div>
            <div class="warning">
              <strong>Important:</strong> This code expires in 10 minutes. If you did not request this, ignore this email.
            </div>
            <div class="footer">
              <p>Best regards,<br><strong>Science with Maleesha | Maleesha Sir Tuition</strong></p>
              <p>Contact: +94 71 439 0924</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

const getPaymentSuccessEmailContent = ({ name, amountText, monthYear, transactionId }) => {
  const safeName = name || 'Student';
  const safeAmount = amountText || 'your payment';
  const safePeriod = monthYear || 'this month';
  const safeTransaction = transactionId || 'N/A';

  return {
    subject: 'Payment Successful - Tuition Sir LMS',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header {
            background: linear-gradient(135deg, #16a34a 0%, #14b8a6 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .success {
            background: #ecfdf5;
            border-left: 4px solid #10b981;
            padding: 14px;
            margin: 18px 0;
            border-radius: 4px;
          }
          .details {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 14px;
            margin: 16px 0;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Successful</h1>
            <p style="margin: 10px 0 0; font-size: 16px;">Science with Maleesha | Maleesha Sir Tuition</p>
          </div>
          <div class="content">
            <p>Hello ${safeName},</p>
            <div class="success">
              <strong>Thank you!</strong> Your payment has been completed successfully.
            </div>

            <div class="details">
              <p style="margin: 0 0 8px;"><strong>Amount:</strong> ${safeAmount}</p>
              <p style="margin: 0 0 8px;"><strong>For:</strong> ${safePeriod}</p>
              <p style="margin: 0;"><strong>Reference:</strong> ${safeTransaction}</p>
            </div>

            <p>You can view this record any time in your student payment history.</p>

            <div class="footer">
              <p>Best regards,<br><strong>Science with Maleesha | Maleesha Sir Tuition</strong></p>
              <p>Contact: +94 71 439 0924</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

// Create email transporter with better configuration
const createTransporter = () => {
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPassword = (process.env.EMAIL_PASSWORD || '').trim();

  // Check if email credentials are configured
  const hasPlaceholders =
    emailUser.toLowerCase().includes('your_email') ||
    emailPassword.toLowerCase().includes('your_email_password');

  if (!emailUser || !emailPassword || hasPlaceholders) {
    console.warn('⚠️  Email credentials not configured in .env file');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
    tls: {
      rejectUnauthorized: false // Accept self-signed certificates
    }
  });
};

const sendEmailViaNodemailer = async ({ to, subject, html }) => {
  const transporter = createTransporter();

  if (!transporter) {
    throw new Error('Email service not configured');
  }

  const mailOptions = {
    from: `"Tuition Sir LMS" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`✅ Email sent to ${to} via Nodemailer - Message ID: ${info.messageId}`);
  return true;
};

const sendEmailViaPhpMailer = async ({ to, subject, html }) => {
  const phpBinary = process.env.PHP_BINARY || 'php';
  const phpScript = path.join(__dirname, '..', 'scripts', 'send-verification-email.php');

  const payload = {
    to,
    subject,
    html,
    transport: String(process.env.EMAIL_TRANSPORT || 'smtp').toLowerCase(),
    fromEmail: (process.env.EMAIL_USER || '').trim(),
    fromName: process.env.EMAIL_FROM_NAME || 'Tuition Sir LMS',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 587),
    username: (process.env.EMAIL_USER || '').trim(),
    password: (process.env.EMAIL_PASSWORD || '').trim(),
    secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true',
  };

  return new Promise((resolve, reject) => {
    const child = spawn(phpBinary, [phpScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start PHP process: ${error.message}`));
    });

    const timeoutMs = Number(process.env.EMAIL_SEND_TIMEOUT_MS || 20000);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('PHPMailer send timed out'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const reason = (stderr || stdout || '').trim() || `PHPMailer process exited with code ${code}`;
        reject(new Error(reason));
        return;
      }

      try {
        const parsed = JSON.parse((stdout || '').trim() || '{}');
        if (!parsed.ok) {
          reject(new Error(parsed.error || 'PHPMailer send failed'));
          return;
        }

        console.log(`✅ Email sent to ${to} via PHPMailer`);
        resolve(true);
      } catch (parseError) {
        reject(new Error(`Invalid PHPMailer response: ${parseError.message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
};

const sendVerificationEmailViaNodemailer = async (email, code, name) => {
  const content = getVerificationEmailContent(code, name);
  return sendEmailViaNodemailer({
    to: email,
    subject: content.subject,
    html: content.html,
  });
};

const sendVerificationEmailViaPhpMailer = async (email, code, name) => {
  const content = getVerificationEmailContent(code, name);
  return sendEmailViaPhpMailer({
    to: email,
    subject: content.subject,
    html: content.html,
  });
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send verification email
const sendVerificationEmail = async (email, code, name) => {
  try {
    const provider = String(process.env.EMAIL_PROVIDER || 'phpmailer').toLowerCase();

    if (provider === 'phpmailer') {
      await sendVerificationEmailViaPhpMailer(email, code, name);
    } else {
      await sendVerificationEmailViaNodemailer(email, code, name);
    }

    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, resetUrl, name) => {
  try {
    const provider = String(process.env.EMAIL_PROVIDER || 'phpmailer').toLowerCase();
    const content = getPasswordResetEmailContent(resetUrl, name);

    if (provider === 'phpmailer') {
      await sendEmailViaPhpMailer({
        to: email,
        subject: content.subject,
        html: content.html,
      });
    } else {
      await sendEmailViaNodemailer({
        to: email,
        subject: content.subject,
        html: content.html,
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    throw error;
  }
};

const sendPasswordResetCodeEmail = async (email, code, name) => {
  try {
    const provider = String(process.env.EMAIL_PROVIDER || 'phpmailer').toLowerCase();
    const content = getPasswordResetCodeEmailContent(code, name);

    if (provider === 'phpmailer') {
      await sendEmailViaPhpMailer({
        to: email,
        subject: content.subject,
        html: content.html,
      });
    } else {
      await sendEmailViaNodemailer({
        to: email,
        subject: content.subject,
        html: content.html,
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Error sending password reset code email:', error.message);
    throw error;
  }
};

const sendPaymentSuccessEmail = async (email, payload) => {
  try {
    const provider = String(process.env.EMAIL_PROVIDER || 'phpmailer').toLowerCase();
    const content = getPaymentSuccessEmailContent(payload || {});

    if (provider === 'phpmailer') {
      await sendEmailViaPhpMailer({
        to: email,
        subject: content.subject,
        html: content.html,
      });
    } else {
      await sendEmailViaNodemailer({
        to: email,
        subject: content.subject,
        html: content.html,
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Error sending payment success email:', error.message);
    throw error;
  }
};

// Send bulk emails to multiple students
const sendBulkEmails = async (recipients) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      throw new Error('Email service not configured');
    }

    const results = [];
    
    // Send emails one by one (or use Promise.all for parallel sending)
    for (const recipient of recipients) {
      try {
        const mailOptions = {
          from: `"Tuition Sir LMS" <${process.env.EMAIL_USER}>`,
          to: recipient.email,
          subject: recipient.subject || 'Message from Tuition Sir LMS',
          html: recipient.htmlContent,
        };
        
        const info = await transporter.sendMail(mailOptions);
        results.push({ email: recipient.email, status: 'sent', messageId: info.messageId });
        console.log(`✅ Email sent to ${recipient.email}`);
      } catch (error) {
        results.push({ email: recipient.email, status: 'failed', error: error.message });
        console.error(`❌ Failed to send email to ${recipient.email}:`, error.message);
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error in bulk email sending:', error.message);
    throw error;
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordResetCodeEmail,
  sendPaymentSuccessEmail,
  sendBulkEmails,
  validateEmailBeforeSending,
  validateEmailFormat,
  isDisposableEmail,
  checkEmailDomain,
};
