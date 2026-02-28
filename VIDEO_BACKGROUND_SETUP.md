# Video Background Setup Guide

## Overview
This guide explains how to set up the video background feature on your Sense Fragrances home page. The video will appear between the logo and the "Discover Your Signature Scent" text, providing an engaging visual experience for visitors.

## Features
- ✅ **Autoplay**: Video automatically starts playing when the page loads
- ✅ **Cross-browser compatibility**: Works on all modern browsers
- ✅ **Mobile responsive**: Optimized for both desktop and mobile devices
- ✅ **Fallback support**: Graceful degradation when video fails to load
- ✅ **Mobile controls**: Touch-friendly play/pause controls on mobile devices
- ✅ **Loading states**: Visual feedback during video loading
- ✅ **Error handling**: Beautiful fallback when video cannot be played

## File Requirements

### 1. Video File (`/public/hero-video.mp4`)
- **Format**: MP4 (H.264 codec)
- **Resolution**: 1920x1080 (Full HD) or higher
- **Duration**: 10-30 seconds recommended
- **File size**: Under 10MB for optimal loading
- **Content**: Luxury perfume/fragrance related imagery
- **Location**: Place in the `/public/` folder

### 2. Poster Image (`/public/video-poster.jpg`)
- **Format**: JPG/JPEG
- **Resolution**: 1920x1080 or higher
- **File size**: Under 500KB
- **Content**: A beautiful frame from your video or related luxury imagery
- **Location**: Place in the `/public/` folder

## Setup Instructions

### Step 1: Prepare Your Video
1. Create or obtain your video content
2. Convert to MP4 format using H.264 codec
3. Optimize for web (compress if necessary)
4. Ensure the video is high quality and represents your brand

### Step 2: Create Poster Image
1. Take a screenshot from your video or create a related image
2. Save as JPG format
3. Optimize for web (compress if necessary)

### Step 3: Upload Files
1. Place `hero-video.mp4` in the `/public/` folder
2. Place `video-poster.jpg` in the `/public/` folder
3. Ensure file names match exactly (case-sensitive)

### Step 4: Test
1. Start your development server
2. Navigate to the home page
3. Verify the video autoplays
4. Test on different devices and browsers
5. Check mobile responsiveness

## Browser Compatibility

### Fully Supported
- Chrome (desktop & mobile)
- Firefox (desktop & mobile)
- Safari (desktop & mobile)
- Edge (desktop & mobile)

### Fallback Support
- Internet Explorer (shows poster image with fallback content)
- Older browsers (shows gradient background with fallback content)

## Mobile Considerations

### Autoplay Policies
- **iOS Safari**: Videos must be muted and have `playsInline` attribute
- **Android Chrome**: Autoplay works with muted videos
- **Mobile browsers**: May require user interaction for autoplay

### Touch Controls
- Mobile devices show a play/pause button
- Users can tap to control video playback
- Button is hidden on desktop devices

## Customization Options

### Video Styling
The video section uses these CSS classes:
- `aspect-video`: Maintains 16:9 aspect ratio
- `rounded-2xl`: Rounded corners
- `shadow-2xl`: Drop shadow effect
- `max-w-4xl`: Maximum width constraint

### Content Customization
You can modify:
- Video description text
- Fallback content
- Loading animation
- Overlay opacity
- Mobile control button styling

## Troubleshooting

### Video Won't Autoplay
1. Ensure video is muted (`muted` attribute)
2. Check browser autoplay policies
3. Verify video file format and codec
4. Check console for error messages

### Video Not Loading
1. Verify file paths are correct
2. Check file permissions
3. Ensure video file is not corrupted
4. Check network connectivity

### Mobile Issues
1. Ensure `playsInline` attribute is present
2. Test on actual mobile devices
3. Check mobile browser console for errors
4. Verify touch controls are working

## Performance Optimization

### Video Optimization
- Use appropriate resolution for your needs
- Compress video files without losing quality
- Consider using WebM format as secondary source
- Use `preload="metadata"` for faster initial load

### Loading Strategy
- Video loads after page initial load
- Poster image shows immediately
- Fallback content ensures smooth experience
- Progressive enhancement approach

## Accessibility

### Screen Readers
- Video has descriptive alt text
- Fallback content is accessible
- Loading states are announced

### Keyboard Navigation
- Video controls are keyboard accessible
- Focus indicators are visible
- Tab order is logical

## SEO Considerations

### Video Metadata
- Use descriptive poster images
- Include relevant alt text
- Consider adding video schema markup
- Ensure video doesn't interfere with page load speed

## Support

If you encounter issues:
1. Check browser console for error messages
2. Verify file formats and sizes
3. Test on different devices and browsers
4. Check network and file permissions
5. Review browser autoplay policies

## Future Enhancements

Potential improvements:
- Video quality selector
- Custom video controls
- Video analytics tracking
- A/B testing different videos
- Dynamic video loading based on device
- Video preloading strategies




