#!/bin/bash
# Genesis v16.2.4 - Email Integration Setup
# Configures email for notifications and monitoring

set -e

echo "========================================"
echo "  GENESIS EMAIL INTEGRATION SETUP"
echo "========================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found"
    exit 1
fi

echo "This script will set up email integration for Genesis."
echo ""
echo "You need:"
echo "1. A Gmail account (or other email provider)"
echo "2. An App Password (NOT your regular Gmail password)"
echo ""
echo "To create a Gmail App Password:"
echo "1. Go to https://myaccount.google.com/apppasswords"
echo "2. Select app: 'Mail'"
echo "3. Select device: 'Other (Genesis)'"
echo "4. Copy the 16-character password"
echo ""

# Get email
read -p "Your Gmail address: " EMAIL

if [ -z "$EMAIL" ]; then
    echo "Email cannot be empty"
    exit 1
fi

# Get app password
read -s -p "Gmail App Password (16 chars, no spaces): " APP_PASSWORD
echo ""

if [ ${#APP_PASSWORD} -lt 10 ]; then
    echo "Warning: App password seems too short"
fi

# Update .env file
update_env() {
    local key=$1
    local value=$2
    if grep -q "^${key}=" .env; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
    else
        echo "${key}=${value}" >> .env
    fi
}

echo ""
echo "Configuring email..."

# Email sending (outgoing)
update_env "GENESIS_EMAIL_PROVIDER" "gmail"
update_env "GENESIS_EMAIL_FROM" "$EMAIL"
update_env "GENESIS_EMAIL_TO" "$EMAIL"
update_env "GMAIL_APP_PASSWORD" "$APP_PASSWORD"

# Email monitoring (incoming via IMAP)
update_env "GENESIS_IMAP_USER" "$EMAIL"
update_env "GENESIS_IMAP_PASS" "$APP_PASSWORD"

echo ""
echo "Testing email configuration..."
echo ""

# Test sending
node -e "
const nodemailer = require('nodemailer');

async function test() {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: '$EMAIL',
            pass: '$APP_PASSWORD'
        }
    });

    try {
        await transporter.sendMail({
            from: '$EMAIL',
            to: '$EMAIL',
            subject: '[Genesis] Email Test Successful',
            text: 'Your Genesis email integration is working!\n\nYou will now receive:\n- PR merge/close notifications\n- Bounty payment alerts\n- Revenue updates\n\n- Genesis AI',
            html: '<h2>Genesis Email Test</h2><p>Your email integration is working!</p><p>You will now receive:</p><ul><li>PR merge/close notifications</li><li>Bounty payment alerts</li><li>Revenue updates</li></ul><p>- Genesis AI</p>'
        });
        console.log('Email sent successfully! Check your inbox.');
    } catch (error) {
        console.error('Email failed:', error.message);
        if (error.message.includes('Invalid login')) {
            console.log('');
            console.log('Tip: Make sure you are using an App Password, not your Gmail password.');
            console.log('Create one at: https://myaccount.google.com/apppasswords');
        }
        process.exit(1);
    }
}
test();
" 2>/dev/null

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "  EMAIL SETUP COMPLETE"
    echo "========================================"
    echo ""
    echo "Genesis will now:"
    echo "  [x] Send you alerts via email"
    echo "  [x] Monitor inbox for GitHub notifications"
    echo "  [x] Auto-record revenue from payment emails"
    echo ""
    echo "Test email sent to: $EMAIL"
else
    echo ""
    echo "Email test failed. Check your credentials."
    echo ""
    echo "Common issues:"
    echo "1. Not using an App Password (16 chars, no spaces)"
    echo "2. 2FA not enabled on your Google account"
    echo "3. Less secure app access blocked"
    echo ""
    echo "Get an App Password: https://myaccount.google.com/apppasswords"
fi

# Clean up backup
rm -f .env.bak
