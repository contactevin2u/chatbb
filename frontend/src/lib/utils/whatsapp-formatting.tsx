/**
 * WhatsApp Text Formatting Parser
 *
 * Converts WhatsApp formatting syntax to React elements:
 * - *text* → bold
 * - _text_ → italic
 * - ~text~ → strikethrough
 * - ```text``` → monospace
 */

import React from 'react';

interface FormattedSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
}

/**
 * Parse WhatsApp formatted text and return React elements
 */
export function formatWhatsAppText(text: string): React.ReactNode {
  if (!text) return null;

  // Handle monospace first (```text```) as it takes precedence
  const monospaceRegex = /```([\s\S]*?)```/g;

  // Handle inline formatting
  // Order matters: process from outside in
  const boldRegex = /\*([^*]+)\*/g;
  const italicRegex = /_([^_]+)_/g;
  const strikeRegex = /~([^~]+)~/g;

  // Split by monospace blocks first
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  // Find all monospace blocks
  const monospaceMatches: { start: number; end: number; content: string }[] = [];
  while ((match = monospaceRegex.exec(text)) !== null) {
    monospaceMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1],
    });
  }

  // Process text with monospace blocks
  if (monospaceMatches.length === 0) {
    // No monospace, just process inline formatting
    return processInlineFormatting(text);
  }

  // Process text around monospace blocks
  for (const mono of monospaceMatches) {
    // Add text before this monospace block
    if (mono.start > lastIndex) {
      const beforeText = text.slice(lastIndex, mono.start);
      parts.push(
        <React.Fragment key={keyCounter++}>
          {processInlineFormatting(beforeText)}
        </React.Fragment>
      );
    }

    // Add monospace block
    parts.push(
      <code
        key={keyCounter++}
        className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono"
      >
        {mono.content}
      </code>
    );

    lastIndex = mono.end;
  }

  // Add remaining text after last monospace block
  if (lastIndex < text.length) {
    const afterText = text.slice(lastIndex);
    parts.push(
      <React.Fragment key={keyCounter++}>
        {processInlineFormatting(afterText)}
      </React.Fragment>
    );
  }

  return <>{parts}</>;
}

/**
 * Process inline formatting (bold, italic, strikethrough)
 * Handles nested formatting like *_bold italic_*
 */
function processInlineFormatting(text: string): React.ReactNode {
  if (!text) return null;

  // Combined regex to match any formatting
  // Matches: *bold*, _italic_, ~strikethrough~
  const formatRegex = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = formatRegex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const char = fullMatch[0];
    const content = fullMatch.slice(1, -1);

    // Recursively process nested formatting
    const innerContent = processInlineFormatting(content);

    switch (char) {
      case '*':
        parts.push(
          <strong key={keyCounter++} className="font-semibold">
            {innerContent}
          </strong>
        );
        break;
      case '_':
        parts.push(
          <em key={keyCounter++} className="italic">
            {innerContent}
          </em>
        );
        break;
      case '~':
        parts.push(
          <span key={keyCounter++} className="line-through">
            {innerContent}
          </span>
        );
        break;
      default:
        parts.push(fullMatch);
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no formatting found, return original text
  if (parts.length === 0) {
    return text;
  }

  return <>{parts}</>;
}

/**
 * Component wrapper for formatted WhatsApp text
 */
export function WhatsAppText({
  text,
  className = ''
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {formatWhatsAppText(text)}
    </span>
  );
}
