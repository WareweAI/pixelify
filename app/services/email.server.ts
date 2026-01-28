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


/**
 * Send subscription-related emails
 */
export async function sendSubscriptionEmail(params: {
  email: string;
  shopName: string;
  type: 'upgrade' | 'downgrade' | 'renewal' | 'activated' | 'expired' | 'cancelled';
  fromPlan: string;
  toPlan: string;
  startDate: Date;
  endDate: Date;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  appId: string;
  currentPlanExpiresAt?: Date; // For downgrades - when current plan expires
}): Promise<boolean> {
  const { email, shopName, type, fromPlan, toPlan, startDate, endDate, price, billingCycle, appId, currentPlanExpiresAt } = params;

  let subject: string;
  let body: string;
  let emailType: string;

  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  switch (type) {
    case 'upgrade':
      subject = `🎉 Your Pixelify Plan Has Been Upgraded!`;
      emailType = 'upgrade';
      body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .plan-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
    .button { background: #5469d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Congratulations on Your Upgrade!</h1>
    </div>
    <div class="content">
      <p>Hi ${shopName},</p>
      <p>Your Pixelify subscription has been successfully upgraded from <strong>${fromPlan}</strong> to <strong>${toPlan}</strong>!</p>
      
      <div class="plan-box">
        <h3>Plan Details:</h3>
        <ul style="list-style: none; padding: 0;">
          <li>📦 <strong>Plan:</strong> ${toPlan}</li>
          <li>💰 <strong>Price:</strong> $${price.toFixed(2)}/${billingCycle}</li>
          <li>📅 <strong>Started:</strong> ${formatDate(startDate)}</li>
          <li>🔄 <strong>Renews:</strong> ${formatDate(endDate)}</li>
        </ul>
      </div>
      
      <p>Your new features are now active and ready to use!</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.SHOPIFY_APP_URL}/app/dashboard" class="button">Go to Dashboard</a>
      </p>
    </div>
    <div class="footer">
      <p>Questions? Reply to this email or visit our support center.</p>
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
      `;
      break;

    case 'downgrade':
      subject = `📋 Your Pixelify Plan Change is Scheduled`;
      emailType = 'downgrade';
      body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ffc107; color: #333; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .warning-box { background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
    .timeline-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6c757d; }
    .plan-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .button { background: #5469d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .timeline-item { padding: 10px 0; border-bottom: 1px solid #e9ecef; }
    .timeline-item:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Plan Change Scheduled</h1>
    </div>
    <div class="content">
      <p>Hi ${shopName},</p>
      <p>We've received your request to change from <strong>${fromPlan}</strong> to <strong>${toPlan}</strong>.</p>
      
      <div class="warning-box">
        <h3>⏰ Important Information:</h3>
        <p>Your current <strong>${fromPlan}</strong> plan will remain active until it expires.</p>
        <p>The <strong>${toPlan}</strong> plan will automatically start after your current plan ends.</p>
      </div>
      
      <div class="timeline-box">
        <h3>📅 Transition Timeline:</h3>
        <div class="timeline-item">
          <strong>Current Plan (${fromPlan}):</strong><br>
          Expires on <strong>${formatDate(currentPlanExpiresAt || startDate)}</strong>
        </div>
        <div class="timeline-item">
          <strong>New Plan (${toPlan}):</strong><br>
          Starts on <strong>${formatDate(startDate)}</strong>
        </div>
        <div class="timeline-item">
          <strong>Next Renewal:</strong><br>
          ${formatDate(endDate)}
        </div>
      </div>
      
      <div class="plan-box">
        <h3>New Plan Details:</h3>
        <ul style="list-style: none; padding: 0;">
          <li>📦 <strong>Plan:</strong> ${toPlan}</li>
          <li>💰 <strong>Price:</strong> $${price.toFixed(2)}/${billingCycle}</li>
          <li>📅 <strong>Starts:</strong> ${formatDate(startDate)}</li>
          <li>🔄 <strong>Renews:</strong> ${formatDate(endDate)}</li>
        </ul>
      </div>
      
      <p>You'll continue to have access to all <strong>${fromPlan}</strong> features until <strong>${formatDate(currentPlanExpiresAt || startDate)}</strong>.</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.SHOPIFY_APP_URL}/app/pricing" class="button">View Plans</a>
      </p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
      `;
      break;

    case 'activated':
      subject = `✅ Your ${toPlan} Plan is Now Active`;
      emailType = 'activated';
      body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .success-box { background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
    .plan-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .button { background: #5469d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Your Plan is Now Active!</h1>
    </div>
    <div class="content">
      <p>Hi ${shopName},</p>
      <p>Your <strong>${toPlan}</strong> plan has been activated and is now live!</p>
      
      <div class="success-box">
        <h3>✅ Plan Activated</h3>
        <p>You now have access to all ${toPlan} features.</p>
      </div>
      
      <div class="plan-box">
        <h3>Plan Details:</h3>
        <ul style="list-style: none; padding: 0;">
          <li>📦 <strong>Plan:</strong> ${toPlan}</li>
          <li>💰 <strong>Price:</strong> $${price.toFixed(2)}/${billingCycle}</li>
          <li>📅 <strong>Started:</strong> ${formatDate(startDate)}</li>
          <li>🔄 <strong>Renews:</strong> ${formatDate(endDate)}</li>
        </ul>
      </div>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.SHOPIFY_APP_URL}/app/dashboard" class="button">Go to Dashboard</a>
      </p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
      `;
      break;

    case 'expired':
      subject = `⚠️ Your Pixelify Subscription Has Expired`;
      emailType = 'expired';
      body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .warning-box { background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545; }
    .button { background: #5469d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Subscription Expired</h1>
    </div>
    <div class="content">
      <p>Hi ${shopName},</p>
      <p>Your <strong>${fromPlan}</strong> subscription has expired and your account has been moved to the <strong>Free</strong> plan.</p>
      
      <div class="warning-box">
        <h3>⚠️ Limited Access</h3>
        <p>You now have access to Free plan features only.</p>
        <p>Expired on: <strong>${formatDate(endDate)}</strong></p>
      </div>
      
      <p>Want to continue with premium features? Upgrade your plan anytime!</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.SHOPIFY_APP_URL}/app/pricing" class="button">Upgrade Now</a>
      </p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
      `;
      break;

    case 'cancelled':
      subject = `Pixelify Subscription Cancelled`;
      emailType = 'cancelled';
      body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6c757d; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .info-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .button { background: #5469d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Subscription Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${shopName},</p>
      <p>Your <strong>${fromPlan}</strong> subscription has been cancelled.</p>
      
      <div class="info-box">
        <p>Your account has been moved to the <strong>Free</strong> plan.</p>
        <p>Cancelled on: <strong>${formatDate(new Date())}</strong></p>
      </div>
      
      <p>We're sorry to see you go! If you change your mind, you can upgrade anytime.</p>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.SHOPIFY_APP_URL}/app/pricing" class="button">View Plans</a>
      </p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
      `;
      break;

    case 'renewal':
      subject = `✅ Your Pixelify Subscription Has Been Renewed`;
      emailType = 'renewal';
      body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .success-box { background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
    .plan-box { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .button { background: #5469d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Subscription Renewed</h1>
    </div>
    <div class="content">
      <p>Hi ${shopName},</p>
      <p>Your <strong>${toPlan}</strong> subscription has been successfully renewed!</p>
      
      <div class="success-box">
        <h3>✅ Renewal Successful</h3>
        <p>Your subscription has been extended.</p>
      </div>
      
      <div class="plan-box">
        <h3>Subscription Details:</h3>
        <ul style="list-style: none; padding: 0;">
          <li>📦 <strong>Plan:</strong> ${toPlan}</li>
          <li>💰 <strong>Price:</strong> $${price.toFixed(2)}/${billingCycle}</li>
          <li>📅 <strong>Renewed:</strong> ${formatDate(startDate)}</li>
          <li>🔄 <strong>Next Renewal:</strong> ${formatDate(endDate)}</li>
        </ul>
      </div>
      
      <p style="text-align: center; margin-top: 30px;">
        <a href="${process.env.SHOPIFY_APP_URL}/app/dashboard" class="button">Go to Dashboard</a>
      </p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Pixelify Team</p>
    </div>
  </div>
</body>
</html>
      `;
      break;

    default:
      return false;
  }

  // Log email notification to database
  try {
    const db = (await import("../db.server")).default;
    
    const notification = await db.emailNotification.create({
      data: {
        appId,
        email,
        type: emailType,
        subject,
        status: 'pending',
        metadata: {
          fromPlan,
          toPlan,
          price,
          billingCycle,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      }
    });

    // Send email
    try {
      await sendEmail({
        to: email,
        subject,
        body
      });

      // Update notification status
      await db.emailNotification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date()
        }
      });

      return true;
    } catch (error) {
      // Update notification status
      await db.emailNotification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      return false;
    }
  } catch (error) {
    console.error('Error logging email notification:', error);
    return false;
  }
}
