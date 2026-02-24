import { useState, useMemo, useEffect } from 'react';
import type { Alert } from '../store/trainStore';
import { LINE_COLORS } from '../data/lines';

interface AlertPanelProps {
  alerts: Alert[];
  activeLines: Set<string> | null;
}

const DESCRIPTION_PREVIEW_LENGTH = 150;

// Check if description has a "What's happening?" section
function hasWhatsHappeningSection(text: string): { hasSection: boolean; beforeText: string; afterText: string } {
  const patterns = ["What's happening?", "What's Happening?", "WHAT'S HAPPENING?"];

  for (const pattern of patterns) {
    const idx = text.indexOf(pattern);
    if (idx !== -1) {
      return {
        hasSection: true,
        beforeText: text.slice(0, idx).trim(),
        afterText: text.slice(idx + pattern.length).trim()
      };
    }
  }

  return { hasSection: false, beforeText: text, afterText: '' };
}

// Icons as components
const ShuttleBusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
  </svg>
);

const AccessibilityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="4" r="2"/>
    <path d="M19 13v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43c-.17-.19-.38-.34-.61-.45-.01 0-.01-.01-.02-.01H13c-.35-.2-.75-.3-1.19-.26C10.76 7.11 10 8.04 10 9.09V15c0 1.1.9 2 2 2h5v5h2v-5.5c0-1.1-.9-2-2-2h-3v-3.45c1.29 1.07 3.25 1.94 5 1.95zm-6.17 5c-.41 1.16-1.52 2-2.83 2-1.66 0-3-1.34-3-3 0-1.31.84-2.41 2-2.83V12.1c-2.28.46-4 2.48-4 4.9 0 2.76 2.24 5 5 5 2.42 0 4.44-1.72 4.9-4h-2.07z"/>
  </svg>
);

const AirplaneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>
);

// Format text with route badges and icons
function formatAlertText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];

  // Pattern to match [route], [shuttle bus icon], [accessibility icon]
  const pattern = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const content = match[1].toLowerCase();

    if (content === 'shuttle bus icon' || content === 'shuttle bus') {
      parts.push(
        <span key={key++} className="alert-icon shuttle-icon" title="Shuttle Bus">
          <ShuttleBusIcon />
        </span>
      );
    } else if (content === 'accessibility icon' || content === 'ad') {
      parts.push(
        <span key={key++} className="alert-icon accessibility-icon" title="Accessibility">
          <AccessibilityIcon />
        </span>
      );
    } else if (content === 'airplane icon' || content === 'airplane' || content === 'airtrain') {
      parts.push(
        <span key={key++} className="alert-icon airplane-icon" title="AirTrain">
          <AirplaneIcon />
        </span>
      );
    } else {
      // It's a route badge
      const routeId = match[1].toUpperCase();
      const colors = LINE_COLORS[routeId];
      parts.push(
        <span
          key={key++}
          className="alert-inline-badge"
          style={{
            backgroundColor: colors?.main || '#808080',
            boxShadow: colors ? `0 0 4px ${colors.glow}` : undefined,
          }}
        >
          {match[1]}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Format description with "What's happening?" section
function formatDescription(text: string): React.ReactNode {
  // Try different variations of the "What's happening?" text
  const patterns = ["What's happening?", "What's Happening?", "WHAT'S HAPPENING?"];
  let whatsHappeningIndex = -1;
  let matchedPattern = "";

  for (const pattern of patterns) {
    const idx = text.indexOf(pattern);
    if (idx !== -1) {
      whatsHappeningIndex = idx;
      matchedPattern = pattern;
      break;
    }
  }

  if (whatsHappeningIndex === -1) {
    return <>{formatAlertText(text)}</>;
  }

  const beforeSection = text.slice(0, whatsHappeningIndex).trim();
  const afterSection = text.slice(whatsHappeningIndex + matchedPattern.length).trim();

  // Only show the "What's happening?" section if there's content after it
  if (!afterSection) {
    return <>{formatAlertText(text)}</>;
  }

  return (
    <>
      {beforeSection && (
        <div className="alert-description-intro">
          {formatAlertText(beforeSection)}
        </div>
      )}
      <div className="whats-happening-section">
        <h4 className="whats-happening-title">What's happening?</h4>
        <p className="whats-happening-content">{formatAlertText(afterSection)}</p>
      </div>
    </>
  );
}

export function AlertPanel({ alerts, activeLines }: AlertPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter alerts to only show those relevant to active lines
  const filteredAlerts = useMemo(() => {
    if (activeLines === null) {
      return [];
    }

    return alerts.filter((alert) =>
      alert.routeIds.some((routeId) => activeLines.has(routeId))
    );
  }, [alerts, activeLines]);

  // Reset expansion state when changing alerts
  useEffect(() => {
    setIsExpanded(false);
  }, [currentIndex]);

  // Reset index if it's out of bounds
  if (currentIndex >= filteredAlerts.length && filteredAlerts.length > 0) {
    setCurrentIndex(0);
  }

  if (filteredAlerts.length === 0 || activeLines === null) {
    return null;
  }

  const currentAlert = filteredAlerts[currentIndex];

  // Safety check - shouldn't happen but prevents runtime error
  if (!currentAlert) {
    return null;
  }

  const hasMultipleAlerts = filteredAlerts.length > 1;

  // Check for "What's happening?" section
  const whatsHappening = hasWhatsHappeningSection(currentAlert.descriptionText);

  // Show "Read more" if there's a What's happening section with content, OR if beforeText is long
  const hasExpandableContent = (whatsHappening.hasSection && whatsHappening.afterText) ||
    whatsHappening.beforeText.length > DESCRIPTION_PREVIEW_LENGTH;

  const goToPrevious = () => {
    setCurrentIndex((prev) =>
      prev === 0 ? filteredAlerts.length - 1 : prev - 1
    );
  };

  const goToNext = () => {
    setCurrentIndex((prev) =>
      prev === filteredAlerts.length - 1 ? 0 : prev + 1
    );
  };

  // Get the color for the first route in the alert
  const primaryRoute = currentAlert.routeIds.find((r) => activeLines.has(r)) || currentAlert.routeIds[0];
  const routeColor = LINE_COLORS[primaryRoute]?.glow || '#808080';

  return (
    <div className="alert-panel-wrapper">
      {hasMultipleAlerts && (
        <button className="alert-nav-btn alert-nav-left" onClick={goToPrevious} aria-label="Previous alert">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M10.5 12L6.5 8L10.5 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      <div className="alert-panel">
        <div className="alert-header">
          <div className="alert-routes">
            {currentAlert.routeIds
              .filter((r) => activeLines.has(r))
              .map((routeId) => (
                <span
                  key={routeId}
                  className="alert-route-badge"
                  style={{
                    backgroundColor: LINE_COLORS[routeId]?.main || '#808080',
                    boxShadow: `0 0 8px ${LINE_COLORS[routeId]?.glow || '#808080'}`,
                  }}
                >
                  {routeId}
                </span>
              ))}
          </div>
          <span className="alert-count">
            {currentIndex + 1} / {filteredAlerts.length}
          </span>
        </div>

        <div className="alert-content">
          <h3 className="alert-title" style={{ color: routeColor }}>
            {formatAlertText(currentAlert.headerText)}
          </h3>
          {currentAlert.descriptionText && (
            <div className={`alert-description ${isExpanded ? 'expanded' : ''}`}>
              {isExpanded ? (
                // Expanded: show full content with "What's happening?" section
                formatDescription(currentAlert.descriptionText)
              ) : (
                // Collapsed: show only text before "What's happening?" (truncated if needed)
                <>
                  {formatAlertText(
                    whatsHappening.beforeText.length > DESCRIPTION_PREVIEW_LENGTH
                      ? whatsHappening.beforeText.slice(0, DESCRIPTION_PREVIEW_LENGTH) + '...'
                      : whatsHappening.beforeText
                  )}
                </>
              )}
              {hasExpandableContent && (
                <button
                  className="read-more-btn"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {hasMultipleAlerts && (
        <button className="alert-nav-btn alert-nav-right" onClick={goToNext} aria-label="Next alert">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M5.5 4L9.5 8L5.5 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
