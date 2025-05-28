export const platformBaseUrls: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  twitter: "https://twitter.com/",
  website: "", // For direct links, or can be a prefix if needed
  // other platforms removed as per requirement
};

export const getProfileUrl = (handle: string, platform: string): string => {
  const lowerCasePlatform = platform.toLowerCase();

  if (lowerCasePlatform === "website") {
    // Assuming the handle is a full URL for 'website'
    if (handle.startsWith("http://") || handle.startsWith("https://")) {
      return handle;
    }
    // If no protocol, assume https
    return `https://${handle}`;
  }

  const baseUrl = platformBaseUrls[lowerCasePlatform];

  if (baseUrl !== undefined) { // Check if platform exists in our trimmed list
    // For platforms like TikTok and YouTube that include "@" in the base URL (not relevant for current list but good practice)
    if (baseUrl.includes("@") && handle.startsWith("@")) {
      return `${baseUrl}${handle.substring(1)}`;
    }
    // For platforms like Instagram, Twitter
    return `${baseUrl}${handle}`;
  }
  
  // Fallback for platforms not in platformBaseUrls (e.g. "other", or any unlisted ones)
  // This will treat the handle as a potential full URL or a part of it.
  // If it doesn't have a protocol, prepend https://.
  if (handle.startsWith("http://") || handle.startsWith("https://")) {
    return handle;
  }
  // If it's a simple string like "example.com/user", it becomes "https://example.com/user"
  // If it's just "userhandle" it becomes "https://userhandle" which might be incorrect but is a defined fallback.
  return `https://${handle}`;
};
