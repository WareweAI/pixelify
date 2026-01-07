export interface EmailData {
  to: string;
  subject: string;
  body: string;
}

export async function sendEmail({ to, subject, body }: EmailData) {
  const apiKey = process.env.PLUNK_API_SECRET;
  if (!apiKey) {
    console.warn("Plunk API secret not configured, email sending disabled");
    throw new Error("Email service not configured");
  }

  console.log(`📧 Attempting to send email to: ${to}`);
  console.log(`📧 Subject: ${subject}`);

  try {
    const response = await fetch("https://api.useplunk.com/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to,
        subject,
        body,
      }),
    });

    console.log(`📧 Plunk API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Plunk API error: ${response.status} - ${errorText}`);
      throw new Error(`Plunk API error: ${response.status} - ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✅ Plunk API success - Email sent:", result);
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    throw error;
  }
}

export async function sendWelcomeEmail(email: string, shopName: string) {
  await sendEmail({
    to: email,
    subject: "Welcome to Pixelify!",
    body: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #008060; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .button { background: #008060; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Welcome to Pixelify!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Thank you for installing Pixelify! You're now ready to start tracking conversions and events.</p>

      <h3>🎯 Getting Started:</h3>
      <ul>
        <li><strong>Track Events:</strong> Start tracking page views and clicks</li>
        <li><strong>Custom Events:</strong> Set up custom conversion events</li>
        <li><strong>Facebook Pixel:</strong> Connect your Facebook pixel</li>
      </ul>

      <p style="text-align: center;">
        <a href="${process.env.SHOPIFY_APP_URL || 'https://pixelify.com/app'}" class="button">Open Your Dashboard</a>
      </p>

      <p>Need help? Check out our <a href="${process.env.HELP_CENTER_URL || 'https://pixelify.com/help'}">Help Center</a>.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendGoodbyeEmail(email: string, shopName: string) {
  await sendEmail({
    to: email,
    subject: "We're sorry to see you go",
    body: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff6b47; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>😔 We're Sorry to See You Go</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>We noticed you've uninstalled Pixelify from your store <strong>${shopName}</strong>.</p>

      <h3>What happens now:</h3>
      <ul>
        <li>All your tracking data has been archived</li>
        <li>Event tracking has been disabled</li>
        <li>You can reinstall anytime to restore functionality</li>
      </ul>

      <p>We'd love to know why you decided to uninstall. Your feedback helps us improve:</p>
      <p style="text-align: center;">
        <a href="${process.env.FEEDBACK_URL || 'https://pixelify.com/feedback'}" style="background: #ff6b47; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Share Your Feedback
        </a>
      </p>

      <p>If this was a mistake or you need help, you can always reinstall from the Shopify App Store.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendPlanPurchaseEmail(
  email: string,
  shopName: string,
  planName: string
) {
  await sendEmail({
    to: email,
    subject: `Thanks for purchasing ${planName}`,
    body: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #008060; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #008060; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ${planName}!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Thank you for purchasing the <strong>${planName}</strong> plan! Your plan has been activated for <strong>${shopName}</strong>.</p>

      <p>You now have access to enhanced tracking features and analytics.</p>

      <p style="text-align: center;">
        <a href="${process.env.SHOPIFY_APP_URL || 'https://pixelify.com/app'}" style="background: #008060; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Explore Your Dashboard
        </a>
      </p>

<p>
  Questions about your plan?{" "}
  <a href="mailto:support@warewe.online">support@warewe.online</a>.
</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendPlanUpgradeEmail(
  email: string,
  shopName: string,
  oldPlan: string,
  newPlan: string
) {
  await sendEmail({
    to: email,
    subject: `Plan upgraded to ${newPlan}`,
    body: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #008060; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #008060; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ${newPlan}!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Thank you for upgrading to <strong>${newPlan}</strong>! You now have access to powerful new features:</p>

      <div class="feature">
        <strong>✅ Enhanced Analytics</strong>
      </div>
      <div class="feature">
        <strong>✅ Advanced Event Tracking</strong>
      </div>
      <div class="feature">
        <strong>✅ Priority Support</strong>
      </div>

      <p>You can start using these features immediately in your dashboard.</p>

      <p style="text-align: center;">
        <a href="${process.env.SHOPIFY_APP_URL || 'https://pixelify.com/app'}" style="background: #008060; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Explore New Features
        </a>
      </p>

      <p>Questions about your new plan? <a href="mailto:support@warewe.online'">support@warewe.online</a>.</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

export async function sendPlanDowngradeEmail(
  email: string,
  shopName: string,
  oldPlan: string,
  newPlan: string
) {
  await sendEmail({
    to: email,
    subject: `Plan changed to ${newPlan}`,
    body: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff6b47; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .limitation { background: #fff3f3; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #ff6b47; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📉 Plan Changed to ${newPlan}</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Your plan has been changed to <strong>${newPlan}</strong>.</p>

      <div class="limitation">
        <strong>⚠️ Some advanced features are now limited</strong>
      </div>

      <p>We're sorry to see you downgrade. If this was due to any issues, please <a href="mailto:support@warewe.online">support@warewe.online</a> so we can improve.</p>

      <p>You can upgrade again anytime from your dashboard.</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}
