# Offer Banner Size Fix

## Problem
The offer banner at the top of the website was expanding and shrinking based on the content length, causing inconsistent layout and poor user experience.

## Solution
Fixed the offer banner to maintain a consistent height of 48px (h-12) regardless of the offer content length.

## Changes Made

### 1. Fixed Height Container
- Set banner container to `h-12` (48px) for consistent height
- Added `h-full` to all child containers to maintain proper alignment

### 2. Optimized Content Layout
- Reduced font sizes to fit better within the fixed height:
  - Title: `text-[10px]` (was `text-[11px]`)
  - Description: `text-xs` (was `text-xs md:text-sm`)
  - Discount code: `text-[10px]` (was `text-xs`)
  - "Copied!" text: `text-[9px]` (was `text-[10px]`)

### 3. Improved Spacing
- Reduced padding on discount code button: `px-2 py-0.5` (was `px-3 py-1`)
- Smaller navigation icons: `h-3 w-3` (was `h-4 w-4`)
- Added proper flex alignment for all elements

### 4. Text Truncation
- Added `truncate` class to title and description to prevent overflow
- Added `min-w-0 flex-1` to text container for proper flex behavior
- Added `flex-shrink-0` to discount code section to prevent compression

### 5. Better Responsive Design
- All elements now properly align within the fixed height
- Consistent spacing across different screen sizes
- Proper vertical centering of all content

## Technical Details

### Before:
```css
/* Dynamic height based on content */
.container { height: auto; }
```

### After:
```css
/* Fixed height container */
.container { height: 48px; }
```

## Benefits

1. **Consistent Layout**: Banner maintains same height regardless of content
2. **Better UX**: No layout shifts when offers change
3. **Professional Appearance**: Clean, uniform design
4. **Responsive**: Works well on all screen sizes
5. **Accessible**: Proper text sizing and spacing

## Testing

The banner now:
- Maintains 48px height with all offer types
- Handles long titles and descriptions gracefully
- Displays discount codes properly
- Works with multiple offers (carousel)
- Maintains proper alignment on all devices
