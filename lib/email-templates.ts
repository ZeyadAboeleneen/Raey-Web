// Email template utilities for consistent styling across all emails
// Supports both dark and light modes with responsive design

export interface EmailTheme {
  mode: 'light' | 'dark'
}

export function getEmailColors(theme: EmailTheme = { mode: 'light' }) {
  const colors = {
    light: {
      background: '#ffffff',
      foreground: '#0a0a0a',
      card: '#ffffff',
      cardForeground: '#0a0a0a',
      muted: '#f5f5f5',
      mutedForeground: '#737373',
      border: '#e5e5e5',
      primary: '#171717',
      primaryForeground: '#fafafa',
      secondary: '#f5f5f5',
      secondaryForeground: '#171717',
      accent: '#f5f5f5',
      accentForeground: '#171717',
      success: '#16a34a',
      warning: '#f59e0b',
      destructive: '#dc2626',
    },
    dark: {
      background: '#0a0a0a',
      foreground: '#fafafa',
      card: '#0a0a0a',
      cardForeground: '#fafafa',
      muted: '#262626',
      mutedForeground: '#a3a3a3',
      border: '#262626',
      primary: '#fafafa',
      primaryForeground: '#171717',
      secondary: '#262626',
      secondaryForeground: '#fafafa',
      accent: '#262626',
      accentForeground: '#fafafa',
      success: '#22c55e',
      warning: '#fbbf24',
      destructive: '#ef4444',
    }
  }

  return colors[theme.mode]
}

export function createEmailTemplate(options: {
  title: string
  preheader?: string
  theme?: EmailTheme
  content: string
  includeUnsubscribe?: boolean
}) {
  const { title, preheader = '', theme = { mode: 'light' }, content, includeUnsubscribe = true } = options
  const colors = getEmailColors(theme)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.alanoudalqadi.com'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  ${preheader ? `<meta name="description" content="${preheader}">` : ''}
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset & Base Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      margin: 0;
      padding: 0;
      background-color: ${colors.background};
      color: ${colors.foreground};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    /* Container */
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: ${colors.card};
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    
    /* Header */
    .email-header {
      background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
      color: ${colors.primaryForeground};
      padding: 40px 30px;
      text-align: center;
      position: relative;
    }
    
    .email-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" patternUnits="userSpaceOnUse" width="100" height="100"><circle cx="25" cy="25" r="1" fill="white" opacity="0.05"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.05"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.03"/><circle cx="10" cy="60" r="0.5" fill="white" opacity="0.03"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>') repeat;
      opacity: 0.3;
    }
    
    .brand-name {
      font-size: 32px;
      font-weight: 300;
      letter-spacing: 4px;
      margin: 0 0 8px 0;
      position: relative;
      z-index: 1;
    }
    
    .brand-tagline {
      font-size: 14px;
      letter-spacing: 2px;
      opacity: 0.9;
      position: relative;
      z-index: 1;
    }
    
    /* Content */
    .email-content {
      padding: 40px 30px;
      background-color: ${colors.card};
    }
    
    /* Typography */
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: ${colors.foreground};
      margin: 0 0 20px 0;
      line-height: 1.3;
    }
    
    h2 {
      font-size: 24px;
      font-weight: 600;
      color: ${colors.foreground};
      margin: 0 0 16px 0;
      line-height: 1.3;
    }
    
    h3 {
      font-size: 20px;
      font-weight: 600;
      color: ${colors.foreground};
      margin: 0 0 12px 0;
      line-height: 1.3;
    }
    
    h4 {
      font-size: 18px;
      font-weight: 600;
      color: ${colors.foreground};
      margin: 0 0 12px 0;
      line-height: 1.3;
    }
    
    p {
      color: ${colors.mutedForeground};
      margin: 0 0 16px 0;
      line-height: 1.6;
    }
    
    /* Cards */
    .email-card {
      background-color: ${colors.muted};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 24px;
      margin: 20px 0;
    }
    
    .email-card-highlight {
      background-color: ${colors.accent};
      border: 1px solid ${colors.border};
      border-left: 4px solid ${colors.primary};
      border-radius: 8px;
      padding: 24px;
      margin: 20px 0;
    }
    
    /* Buttons */
    .btn {
      display: inline-block;
      padding: 14px 28px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
      text-align: center;
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
      line-height: 1;
    }
    
    .btn-primary {
      background-color: ${colors.primary};
      color: ${colors.primaryForeground};
    }
    
    .btn-secondary {
      background-color: ${colors.secondary};
      color: ${colors.secondaryForeground};
      border: 1px solid ${colors.border};
    }
    
    .btn-success {
      background-color: ${colors.success};
      color: white;
    }
    
    .btn-warning {
      background-color: ${colors.warning};
      color: white;
    }
    
    /* Lists */
    ul {
      color: ${colors.mutedForeground};
      padding-left: 20px;
      margin: 0 0 16px 0;
    }
    
    li {
      margin-bottom: 8px;
      line-height: 1.6;
    }
    
    /* Divider */
    .divider {
      height: 1px;
      background-color: ${colors.border};
      margin: 30px 0;
      border: none;
    }
    
    /* Footer */
    .email-footer {
      background-color: ${colors.muted};
      color: ${colors.mutedForeground};
      padding: 30px;
      text-align: center;
      font-size: 14px;
      line-height: 1.6;
    }
    
    .email-footer a {
      color: ${colors.mutedForeground};
      text-decoration: underline;
    }
    
    .email-footer a:hover {
      color: ${colors.foreground};
    }
    
    /* Status badges */
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .status-badge-success {
      background-color: ${colors.success};
      color: white;
    }
    
    .status-badge-warning {
      background-color: ${colors.warning};
      color: white;
    }
    
    .status-badge-info {
      background-color: ${colors.primary};
      color: ${colors.primaryForeground};
    }
    
    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid ${colors.border};
    }
    
    th {
      background-color: ${colors.muted};
      color: ${colors.foreground};
      font-weight: 600;
    }
    
    td {
      color: ${colors.mutedForeground};
    }
    
    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 0 10px;
        border-radius: 8px;
      }
      
      .email-header {
        padding: 30px 20px;
      }
      
      .email-content {
        padding: 30px 20px;
      }
      
      .email-footer {
        padding: 20px;
      }
      
      .btn {
        display: block;
        margin: 10px 0;
      }
      
      h1 {
        font-size: 24px;
      }
      
      h2 {
        font-size: 20px;
      }
      
      .brand-name {
        font-size: 28px;
        letter-spacing: 3px;
      }
    }
    
    /* Dark mode overrides (for email clients that support it) */
    @media (prefers-color-scheme: dark) {
      .force-light {
        background-color: ${getEmailColors({ mode: 'light' }).background} !important;
        color: ${getEmailColors({ mode: 'light' }).foreground} !important;
      }
      
      .force-light .email-card {
        background-color: ${getEmailColors({ mode: 'light' }).muted} !important;
        border-color: ${getEmailColors({ mode: 'light' }).border} !important;
      }
    }
  </style>
</head>
<body>
  ${preheader ? `
  <div style="display: none; overflow: hidden; line-height: 1px; opacity: 0; max-height: 0; max-width: 0;">
    ${preheader}
  </div>
  ` : ''}
  
  <div style="background-color: ${colors.background}; padding: 20px 0;">
    <div class="email-container">
      <!-- Header -->
      <div class="email-header">
        <h1 class="brand-name">RAEY</h1>
        <p class="brand-tagline">COUTURE ATELIER</p>
      </div>
      
      <!-- Content -->
      <div class="email-content">
        ${content}
      </div>
      
      <!-- Footer -->
      <div class="email-footer">
        <p style="margin: 0 0 15px 0;">
          © 2025 Raey. All rights reserved.
        </p>
        <p style="margin: 0;">
          <a href="${baseUrl}/contact">Contact Us</a> • 
          <a href="${baseUrl}/about">About Us</a>
          ${includeUnsubscribe ? ` • <a href="${baseUrl}/unsubscribe">Unsubscribe</a>` : ''}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

// Helper function to create email content sections
export function createEmailSection(options: {
  title?: string
  content: string
  highlight?: boolean
  className?: string
}) {
  const { title, content, highlight = false, className = '' } = options

  return `
    <div class="${highlight ? 'email-card-highlight' : 'email-card'} ${className}">
      ${title ? `<h3>${title}</h3>` : ''}
      ${content}
    </div>
  `
}

// Helper function for product information
export function createProductCard(product: {
  name: string
  price?: number
  image?: string
  description?: string
}) {
  return `
    <div class="email-card">
      <div style="display: flex; align-items: center; margin-bottom: 15px;">
        ${product.image ? `
          <img src="${product.image}" alt="${product.name}" 
               style="width: 80px; height: 80px; border-radius: 8px; margin-right: 15px; object-fit: cover;">
        ` : `
          <div style="width: 80px; height: 80px; background-color: #f0f0f0; border-radius: 8px; margin-right: 15px; display: flex; align-items: center; justify-content: center; color: #999;">
            <span style="font-size: 12px;">No Image</span>
          </div>
        `}
        <div>
          <h4 style="margin: 0 0 5px 0;">${product.name}</h4>
          ${product.price ? `<p style="margin: 0; font-weight: 600;">${product.price.toFixed(2)} EGP</p>` : ''}
        </div>
      </div>
      ${product.description ? `<p>${product.description}</p>` : ''}
    </div>
  `
}

// Helper function for order items table
export function createOrderItemsTable(items: Array<{
  name: string
  quantity: number
  price: number
  total: number
}>, currencyCode: string) {
  const safeCurrency = currencyCode || 'USD'

  const itemsHtml = items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.price.toFixed(0)} ${safeCurrency}</td>
      <td style="text-align: right; font-weight: 600;">${item.total.toFixed(0)} ${safeCurrency}</td>
    </tr>
  `).join('')

  return `
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
  `
}

// Utility function to create both light and dark mode email variants
export function createEmailWithDarkModeVariant(options: {
  title: string
  preheader?: string
  content: string
  includeUnsubscribe?: boolean
}) {
  const lightMode = createEmailTemplate({
    ...options,
    theme: { mode: 'light' }
  })

  const darkMode = createEmailTemplate({
    ...options,
    theme: { mode: 'dark' }
  })

  return {
    light: lightMode,
    dark: darkMode,
    // Return light mode by default for compatibility
    html: lightMode
  }
}

// Function to detect user's preferred color scheme and return appropriate email
export function getEmailForPreference(emails: { light: string; dark: string }, userPreference?: 'light' | 'dark') {
  // If user preference is provided, use it
  if (userPreference) {
    return userPreference === 'dark' ? emails.dark : emails.light
  }

  // Default to light mode for maximum compatibility
  return emails.light
}
