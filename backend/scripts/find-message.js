const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Find conversation for group 120363409615271242
  const conv = await client.query(`
    SELECT c.id as conv_id, co.display_name
    FROM conversations c
    JOIN contacts co ON c.contact_id = co.id
    WHERE co.identifier = '120363409615271242'
  `);

  if (conv.rows.length === 0) {
    console.log('Conversation not found');
    await client.end();
    return;
  }

  const convId = conv.rows[0].conv_id;
  console.log('Group:', conv.rows[0].display_name);
  console.log('Conv ID:', convId);

  // Search for message containing oc4648
  console.log('\n--- Searching for "oc4648" ---\n');

  const messages = await client.query(`
    SELECT id, type, direction, status, content, metadata, created_at
    FROM messages
    WHERE conversation_id = $1
    AND (
      content->>'text' ILIKE '%oc4648%'
      OR (content->'message'->>'conversation')::text ILIKE '%oc4648%'
      OR (content->'message'->'extendedTextMessage'->>'text')::text ILIKE '%oc4648%'
      OR content::text ILIKE '%oc4648%'
    )
    ORDER BY created_at DESC
    LIMIT 10
  `, [convId]);

  console.log(`Found ${messages.rows.length} messages:\n`);

  messages.rows.forEach((m, i) => {
    console.log(`--- Message ${i + 1} ---`);
    console.log('ID:', m.id);
    console.log('Type:', m.type);
    console.log('Direction:', m.direction);
    console.log('Status:', m.status);
    console.log('Created:', m.created_at);
    console.log('Content:', JSON.stringify(m.content, null, 2));
    if (m.metadata) {
      console.log('Metadata keys:', Object.keys(m.metadata));
    }
    console.log();
  });

  // Also check if it's renderable based on our logic
  if (messages.rows.length > 0) {
    console.log('\n--- Renderability Check ---\n');
    for (const m of messages.rows) {
      const content = m.content;
      const type = m.type;

      // Check standard format
      const hasText = !!content?.text;
      const hasCaption = !!content?.caption;
      const hasMediaUrl = !!content?.mediaUrl;

      // Check raw format
      const msg = content?.message;
      const hasConversation = !!msg?.conversation;
      const hasExtendedText = !!msg?.extendedTextMessage?.text;
      const hasImageCaption = !!msg?.imageMessage?.caption;

      // Check protocol message
      const hasProtocol = !!msg?.protocolMessage;
      const hasSenderKey = !!msg?.senderKeyDistributionMessage && !msg?.conversation && !msg?.extendedTextMessage;
      const hasAssociatedChild = !!msg?.associatedChildMessage && !msg?.conversation && !msg?.extendedTextMessage;

      console.log(`Message ${m.id.slice(0, 8)}:`);
      console.log(`  Type: ${type}`);
      console.log(`  hasText: ${hasText}`);
      console.log(`  hasCaption: ${hasCaption}`);
      console.log(`  hasMediaUrl: ${hasMediaUrl}`);
      console.log(`  hasConversation: ${hasConversation}`);
      console.log(`  hasExtendedText: ${hasExtendedText}`);
      console.log(`  hasImageCaption: ${hasImageCaption}`);
      console.log(`  isProtocol: ${hasProtocol}`);
      console.log(`  hasSenderKey: ${hasSenderKey}`);
      console.log(`  hasAssociatedChild: ${hasAssociatedChild}`);

      // Would it be renderable?
      let renderable = false;
      if (hasProtocol || hasSenderKey || hasAssociatedChild) {
        renderable = false;
        console.log(`  FILTERED: Protocol/system message`);
      } else if (type === 'TEXT') {
        const textContent = content?.text || msg?.conversation || msg?.extendedTextMessage?.text;
        renderable = !!textContent && textContent.trim().length > 0;
        console.log(`  TEXT renderable: ${renderable} (text: "${(textContent || '').slice(0, 50)}...")`);
      } else {
        renderable = hasText || hasCaption || hasMediaUrl || hasConversation || hasExtendedText;
        console.log(`  Other type renderable: ${renderable}`);
      }
      console.log(`  FINAL: ${renderable ? '✅ SHOULD RENDER' : '❌ FILTERED OUT'}`);
      console.log();
    }
  }

  await client.end();
}

run().catch(console.error);
