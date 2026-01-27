# Facebook Token Management - Quick Start Guide

## ✅ What Was Fixed

Your Facebook access tokens were expiring after 1-2 hours, causing "Session has expired" errors. Now:

- ✅ Tokens are automatically exchanged for **60-day long-lived tokens**
- ✅ Tokens **refresh automatically** before they expire
- ✅ You can see **when tokens expire** in the dashboard
- ✅ You can **manually refresh** tokens anytime
- ✅ **No more "Session expired" errors** during event tracking

## 🚀 How to Use

### 1. Connect Facebook (First Time)

1. Go to your dashboard
2. Click **"Connect Facebook"**
3. Authorize the app
4. ✅ Done! Token is automatically exchanged for 60-day version

### 2. Check Token Status

In your dashboard, you'll see:

```
👤 Facebook Connected [✓ Active]
   Logged in as Your Name • 3 pixel(s) available
   Token expires: Mar 28, 2025
```

If expiring soon (< 7 days):
```
👤 Facebook Connected [✓ Active]
   Logged in as Your Name • 3 pixel(s) available
   Token expires: Jan 30, 2025 [⚠ Expiring Soon]
```

### 3. Refresh Token Manually

Click the **"Refresh Token"** button in the dashboard to:
- Get a new 60-day token
- Update expiry date
- Ensure uninterrupted tracking

### 4. Automatic Refresh

Tokens refresh automatically:
- ✅ When sending events (if expired)
- ✅ When processing catalog events (if expired)
- ✅ Via cron job (if set up - see below)

## 🔧 Setup Cron Job (Recommended)

To prevent tokens from ever expiring, set up a daily cron job:

### Option 1: Vercel Cron (Recommended for Vercel deployments)

Create `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/refresh-tokens",
    "schedule": "0 2 * * *"
  }]
}
```

Add to `.env`:
```env
CRON_SECRET=your_random_secret_here
```

### Option 2: External Cron Service

Use a service like cron-job.org or EasyCron:

**URL**: `https://your-app.com/api/refresh-tokens`
**Method**: POST
**Headers**: `Authorization: Bearer YOUR_CRON_SECRET`
**Schedule**: Daily at 2 AM

### Option 3: Server Cron

Add to your server's crontab:
```bash
0 2 * * * curl -X POST https://your-app.com/api/refresh-tokens -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## 📊 Monitoring

### Check Logs

Look for these messages in your logs:

**✅ Success**:
```
[Token Refresh] ✅ Token refreshed successfully for app abc123
[Tracking] Facebook access token refreshed successfully
```

**⚠️ Warning**:
```
[Token Refresh] Token for app abc123 expired or expiring soon, refreshing...
```

**❌ Error**:
```
[Token Refresh] ❌ Failed to refresh token for app abc123
Meta CAPI error: Error validating access token: Session has expired
```

### Dashboard Indicators

- **Green Badge**: Token is fresh (> 7 days)
- **Yellow Badge**: Token expiring soon (< 7 days)
- **No Badge**: Token may be expired - click "Refresh Token"

## 🐛 Troubleshooting

### "Session has expired" Error Still Appearing

**Solution 1**: Click "Refresh Token" in dashboard
- This will get a new 60-day token immediately

**Solution 2**: Reconnect Facebook
- Click "Disconnect" then "Connect Facebook"
- This creates a fresh OAuth connection

**Solution 3**: Check Environment Variables
```bash
# Make sure these are set:
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

### Token Not Refreshing Automatically

**Check 1**: Verify token expiry is set
```sql
SELECT metaAccessToken, metaTokenExpiresAt FROM AppSettings;
```

**Check 2**: Check logs for refresh attempts
```
grep "Token Refresh" your-app.log
```

**Check 3**: Manually trigger refresh
- Click "Refresh Token" button
- Check if it works

### Cron Job Not Working

**Check 1**: Verify CRON_SECRET is set
```bash
echo $CRON_SECRET
```

**Check 2**: Test endpoint manually
```bash
curl -X POST https://your-app.com/api/refresh-tokens \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Check 3**: Check cron job logs
- Vercel: Check deployment logs
- Server: Check `/var/log/cron.log`

## 📝 Best Practices

1. **Set up cron job** - Prevents tokens from expiring
2. **Monitor logs** - Watch for refresh failures
3. **Check dashboard weekly** - Verify token expiry dates
4. **Test after changes** - Reconnect Facebook after app updates
5. **Keep secrets secure** - Never commit CRON_SECRET to git

## 🔐 Security

- Tokens are stored encrypted in database
- Only long-lived tokens (60 days) are saved
- Tokens refresh automatically before expiry
- Manual refresh available anytime
- Cron endpoint requires authentication

## 📚 Additional Resources

- `FACEBOOK_TOKEN_REFRESH.md` - Complete technical documentation
- `TOKEN_FLOW_DIAGRAM.md` - Visual flow diagrams
- `CHANGES_SUMMARY.md` - Implementation details

## 🆘 Need Help?

If you're still experiencing issues:

1. Check the logs for error messages
2. Try reconnecting Facebook
3. Verify environment variables are set
4. Test the refresh endpoint manually
5. Check Facebook App settings in Meta Developer Console

## ✨ Summary

Your Facebook token management is now fully automated:

- 🔄 Tokens exchange automatically (short → long-lived)
- ⏰ Tokens refresh automatically (before expiry)
- 📊 Token status visible in dashboard
- 🔘 Manual refresh available anytime
- 🤖 Cron job keeps tokens fresh (optional but recommended)

**No more "Session expired" errors!** 🎉
