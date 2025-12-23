const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

// Replicate frontend isProtocolMessage logic
function isProtocolMessage(content) {
  const msg = content?.message;
  if (!msg) return false;

  if (msg.protocolMessage) return true;
  if (msg.senderKeyDistributionMessage && !msg.conversation && !msg.extendedTextMessage) return true;
  if (msg.associatedChildMessage && !msg.conversation && !msg.extendedTextMessage) return true;
  if (msg.messageContextInfo && Object.keys(msg).length <= 2 &&
      !msg.conversation && !msg.extendedTextMessage && !msg.imageMessage &&
      !msg.videoMessage && !msg.audioMessage && !msg.documentMessage) {
    return true;
  }
  return false;
}

// Replicate frontend getMessageText logic
function getMessageText(content) {
  if (!content) return null;
  if (content.text) return content.text;
  if (content.caption) return content.caption;

  const msg = content?.message;
  if (!msg) return null;

  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;

  return null;
}

// Replicate frontend isMessageRenderable logic for TEXT type
function wouldRender(type, content) {
  if (!content) return { renderable: false, reason: 'no content' };

  if (isProtocolMessage(content)) {
    return { renderable: false, reason: 'isProtocolMessage=true' };
  }

  if (type === 'TEXT') {
    const textContent = content.text || getMessageText(content);
    if (!textContent || textContent.trim().length === 0) {
      return { renderable: false, reason: 'TEXT but no extractable text' };
    }
    return { renderable: true, reason: 'has text' };
  }

  return { renderable: true, reason: 'non-TEXT type' };
}

async function run() {
  await client.connect();

  // Get recent outbound messages from KATIL group
  const msgs = await client.query(`
    SELECT id, type, direction, content, created_at
    FROM messages
    WHERE conversation_id = '697d2f13-20dc-462b-9fe6-dbf144e60aec'
    AND direction = 'OUTBOUND'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.log('Analyzing OUTBOUND messages for renderability:\n');

  let wouldShow = 0;
  let wouldHide = 0;

  msgs.rows.forEach((m, i) => {
    const result = wouldRender(m.type, m.content);
    if (result.renderable) {
      wouldShow++;
    } else {
      wouldHide++;
      console.log(`❌ HIDDEN: ${m.id.slice(0, 8)} [${m.type}]`);
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Content keys: ${Object.keys(m.content || {}).join(', ')}`);
      if (m.content?.message) {
        console.log(`   Message keys: ${Object.keys(m.content.message).join(', ')}`);
      }
      console.log();
    }
  });

  console.log(`\nSummary: ${wouldShow} would show, ${wouldHide} would be hidden`);

  // Count all outbound that would be hidden
  const allOutbound = await client.query(`
    SELECT type, content
    FROM messages
    WHERE conversation_id = '697d2f13-20dc-462b-9fe6-dbf144e60aec'
    AND direction = 'OUTBOUND'
  `);

  let totalHidden = 0;
  let hiddenByReason = {};

  allOutbound.rows.forEach(m => {
    const result = wouldRender(m.type, m.content);
    if (!result.renderable) {
      totalHidden++;
      hiddenByReason[result.reason] = (hiddenByReason[result.reason] || 0) + 1;
    }
  });

  console.log(`\nTotal OUTBOUND: ${allOutbound.rows.length}`);
  console.log(`Would be hidden: ${totalHidden}`);
  console.log('\nHidden by reason:');
  Object.entries(hiddenByReason).forEach(([reason, count]) => {
    console.log(`  ${reason}: ${count}`);
  });

  await client.end();
}

run().catch(console.error);
