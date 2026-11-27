// SPDX-License-Identifier: MIT
// Change REPO_URL after you fork/publish so share links and badges point to your repository.
export const REPO_URL = 'https://github.com/YOUR_GITHUB_USERNAME/delulu';
export const SITE_URL = 'https://YOUR_GITHUB_USERNAME.github.io/delulu/';
export const VERSION = '1.0.0';

// "Buy the dev a coffee" — set DONATE.url later. Placeholders: {amount}, {currency}.
// Examples:
//   'https://buymeacoffee.com/yourname'
//   'https://razorpay.me/@yourname?amount={amount}'
//   'upi://pay?pa=yourname@okaxis&pn=Delulu&am={amount}&cu=INR'
//   'https://github.com/sponsors/yourname'
export const DONATE = {
  url: '',
  defaultCurrency: 'INR',
  presets: { INR: [49, 99, 199, 499], USD: [2, 5, 10, 25] },
};
