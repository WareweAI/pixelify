/**
 * Test script to verify Plunk email configuration
 * Run with: node scripts/test-plunk-email.js
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

const PLUNK_API_SECRET = process.env.PLUNK_API_SECRET;

console.log('🔍 Plunk Configuration Test\n');
console.log('Environment Variables:');
console.log(`  - PLUNK_API_SECRET: ${PLUNK_API_SECRET ? '✅ SET' : '❌ NOT SET'}`);
console.log(`  - Length: ${PLUNK_API_SECRET?.length || 0}`);
console.log(`  - Prefix: ${PLUNK_API_SECRET?.substring(0, 10) || 'N/A'}...\n`);

if (!PLUNK_API_SECRET) {
  console.error('❌ PLUNK_API_SECRET is not set in .env file');
  process.exit(1);
}

// Test email sending
async function testEmail() {
  const testEmail = 'test@example.com'; // Change this to your email
  const subject = 'Test Email from Pixelify';
  const body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 Test Email</h1>
    </div>
    <div style="padding: 20px;">
      <p>This is a test email from Pixelify to verify Plunk integration.</p>
      <p>If you received this, the email service is working correctly!</p>
    </div>
  </div>
</body>
</html>
  `;

  console.log('📧 Sending test email...');
  console.log(`   To: ${testEmail}`);
  console.log(`   Subject: ${subject}\n`);

  try {
    const response = await fetch('https://api.useplunk.com/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PLUNK_API_SECRET}`,
      },
      body: JSON.stringify({
        to: testEmail,
        subject,
        body,
      }),
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    console.log(`📄 Response Body: ${responseText}\n`);

    if (response.ok) {
      const result = JSON.parse(responseText);
      console.log('✅ SUCCESS! Email sent successfully');
      console.log('Response:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ FAILED! Email sending failed');
      console.error('Error:', responseText);
      
      // Common error messages
      if (response.status === 401) {
        console.error('\n💡 Tip: Check if your PLUNK_API_SECRET is correct');
      } else if (response.status === 400) {
        console.error('\n💡 Tip: Check if the email format is valid');
      }
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEmail();
