# QR Code Payment Integration Guide 🤑

Your Swear Jar app now includes **QR code payment integration** for Apple Pay, Venmo, PayPal, and Zelle!

## ✨ Features Added

### 1. **QR Code Modal**
- Beautiful, centered modal with QR code
- Shows recipient name, amount, and payment type
- Instructions specific to each payment method
- One-tap "Open App" button for direct payment
- Copy payment info fallback

### 2. **Payment Methods Supported**

#### 🍎 **Apple Pay Cash**
- Requires phone number in Settings
- QR code links to Apple Pay Cash URL
- **iOS only** — works with Wallet app
- Example URL: `https://cash.me/$5555555555/10.00`

#### 💜 **Venmo**
- Requires @username in Settings
- QR code contains payment request URL
- Pre-fills amount and "Swear Jar" note
- Example: `@markslyder` → Opens Venmo with charge request

#### 🔵 **PayPal**
- Requires @username in Settings
- QR code links to PayPal.me URL
- Pre-fills payment amount
- Example: `@markslyder` → `https://paypal.me/markslyder/10.00`

#### ⚡ **Zelle**
- Requires phone or email in Settings
- QR code shows contact info for manual entry
- No universal web URL (bank-dependent)
- User copies info and opens their banking app

## 🎯 How to Use

### For Winners (Receiving Payment):
1. Go to **Settings** → **People in the jar**
2. For each person, select their payment method (🍎 🔵 💜 ⚡)
3. Enter their payment handle/phone/email
4. Save Settings

### When Month Ends:
1. The winner announcement shows each loser
2. Tap **📱 QR** button next to their name
3. Modal appears with:
   - Scannable QR code
   - "Open App" button (auto-launch payment app)
   - Copy button (fallback)
4. Scan with camera or tap "Open App"
5. Complete payment in their app

## 📱 Testing

### Test QR Code Generation:
1. Add payment info in Settings:
   - **Apple Pay**: `555-867-5309`
   - **Venmo**: `@testuser`
   - **PayPal**: `@testuser`
   - **Zelle**: `test@example.com`

2. Log some swears and end the month

3. In the winner modal, tap **📱 QR** next to a loser's name

4. You should see:
   - QR code (200x200px, high error correction)
   - Payment amount in gradient text
   - "Open App" button (launches payment app)
   - "Copy Payment Info" button

### Test on Different Devices:
- **iOS**: Apple Pay Cash URLs will work natively
- **Android**: Venmo/PayPal/Zelle will work
- **Desktop**: QR codes can be scanned by phone camera

## 🔧 Technical Details

### QR Code Library
Using **qrcode.js** from CDN:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
```

### URL Formats

**Apple Pay Cash:**
```
https://cash.me/$PHONE_NUMBER/AMOUNT
```

**Venmo (Payment Request):**
```
https://venmo.com/?txn=charge&audience=private&recipients=USERNAME&amount=AMOUNT&note=Swear%20Jar
```

**PayPal:**
```
https://paypal.me/USERNAME/AMOUNT
```

**Zelle:**
No universal URL — QR contains email/phone for manual entry

## 🎨 Customization

### Change QR Code Colors
In `showQrPayment()` function:
```javascript
new QRCode(qrContainer, {
  text: qrData,
  width: 200,
  height: 200,
  colorDark: '#7c4dff',  // Change to purple
  colorLight: '#ffffff',
  correctLevel: QRCode.CorrectLevel.H
});
```

### Add More Payment Methods
In `PAYMENT_TYPES` array:
```javascript
{ 
  id: 'cashapp', 
  label: 'Cash App', 
  icon: '💵', 
  placeholder: '$cashtag (e.g. $markslyder)' 
}
```

Then add URL handler in `showQrPayment()`:
```javascript
case 'cashapp':
  paymentUrl = `https://cash.app/${paymentInfo}/${amt}`;
  break;
```

## 🐛 Troubleshooting

### QR Code Not Appearing
- Check browser console for errors
- Ensure qrcode.js library loaded successfully
- Verify payment info is saved in Settings

### "Open App" Button Doesn't Work
- **Apple Pay**: Only works on iOS devices with Wallet set up
- **Venmo/PayPal**: Requires app installed
- Fallback: Use QR code scan or copy button

### URLs Not Opening
- Check that payment handles are formatted correctly:
  - Venmo: `@username` or `username`
  - PayPal: `@username` or `username`
  - Apple Pay: 10-digit phone number
  - Zelle: Valid email or phone

## 🚀 Future Enhancements

- [ ] Add Cash App support
- [ ] Save QR code as image
- [ ] Share QR code via Messages/Email
- [ ] Show payment confirmation when received
- [ ] Support multiple payment methods per person
- [ ] Batch payment requests (charge all losers at once)

---

**Enjoy the seamless payment experience!** 💸🎉
