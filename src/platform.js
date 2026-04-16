export function isIOS() {
	const ua = navigator.userAgent || '';
	if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
	// iPadOS 13+ reports as Macintosh with multi-touch support.
	if (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
	return false;
}

export function isIOSStandalone() {
	return isIOS() && window.navigator.standalone === true;
}
