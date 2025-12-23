const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const GROUP_ID = '120363409615271242';

async function debugGroup() {
  try {
    await client.connect();
    console.log('Connected! Investigating group:', GROUP_ID, '\n');

    // Get contact info
    console.log('=== CONTACT INFO ===\n');
    const contact = await client.query(`
      SELECT * FROM contacts WHERE identifier = $1
    `, [GROUP_ID]);

    if (contact.rows.length === 0) {
      console.log('Contact not found with identifier:', GROUP_ID);
      // Try searching by partial match
      const similar = await client.query(`
        SELECT id, identifier, display_name, is_group, metadata
        FROM contacts
        WHERE identifier LIKE $1 OR display_name ILIKE '%KATIL%Prihatin%'
        LIMIT 5
      `, ['%' + GROUP_ID.slice(-10) + '%']);
      console.log('Similar contacts found:', similar.rows);
    } else {
      const c = contact.rows[0];
      console.log('ID:', c.id);
      console.log('Identifier:', c.identifier);
      console.log('Display Name:', c.display_name);
      console.log('Is Group:', c.is_group);
      console.log('Metadata:', JSON.stringify(c.metadata, null, 2));
      console.log('Created:', c.created_at);

      // Get conversation
      console.log('\n=== CONVERSATION INFO ===\n');
      const conv = await client.query(`
        SELECT c.*, ch.name as channel_name
        FROM conversations c
        JOIN channels ch ON c.channel_id = ch.id
        WHERE c.contact_id = $1
      `, [c.id]);

      for (const cv of conv.rows) {
        console.log('Conv ID:', cv.id);
        console.log('Status:', cv.status);
        console.log('Channel:', cv.channel_name);
        console.log('Last Message:', cv.last_message_at);
        console.log('Assigned User:', cv.assigned_user_id);
        console.log('Unread Count:', cv.unread_count);
        console.log('Is Pinned:', cv.is_pinned);

        // Get message count and recent messages
        console.log('\n=== MESSAGE STATS ===\n');
        const msgCount = await client.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE direction = 'INBOUND') as inbound,
            COUNT(*) FILTER (WHERE direction = 'OUTBOUND') as outbound,
            MIN(created_at) as first_msg,
            MAX(created_at) as last_msg
          FROM messages WHERE conversation_id = $1
        `, [cv.id]);
        console.log('Total Messages:', msgCount.rows[0].total);
        console.log('Inbound:', msgCount.rows[0].inbound);
        console.log('Outbound:', msgCount.rows[0].outbound);
        console.log('First Message:', msgCount.rows[0].first_msg);
        console.log('Last Message:', msgCount.rows[0].last_msg);

        // Get last 10 messages
        console.log('\n=== LAST 10 MESSAGES ===\n');
        const msgs = await client.query(`
          SELECT id, direction, content, metadata, status, created_at
          FROM messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 10
        `, [cv.id]);

        for (const m of msgs.rows) {
          console.log('---');
          console.log('ID:', m.id);
          console.log('Direction:', m.direction);
          console.log('Status:', m.status);
          console.log('Created:', m.created_at);
          const content = m.content || {};
          console.log('Text:', (content.text || '').slice(0, 100));
          console.log('Has Media:', !!(content.mediaUrl || content.message?.imageMessage || content.message?.videoMessage));
          const meta = m.metadata || {};
          console.log('Sender:', meta.groupSender?.pushName || meta.pushName || 'Unknown');
          console.log('Sender ID:', meta.groupSender?.identifier || meta.key?.participant || 'Unknown');
        }

        // Check for any anomalies
        console.log('\n=== ANOMALY CHECK ===\n');

        // Messages without proper metadata
        const noMeta = await client.query(`
          SELECT COUNT(*) as count
          FROM messages
          WHERE conversation_id = $1
          AND (metadata IS NULL OR metadata = '{}')
        `, [cv.id]);
        console.log('Messages without metadata:', noMeta.rows[0].count);

        // Duplicate message IDs
        const dupes = await client.query(`
          SELECT (metadata->>'key'->>'id') as msg_key, COUNT(*) as cnt
          FROM messages
          WHERE conversation_id = $1
          AND metadata->'key'->>'id' IS NOT NULL
          GROUP BY metadata->'key'->>'id'
          HAVING COUNT(*) > 1
          LIMIT 10
        `, [cv.id]);
        console.log('Duplicate message keys:', dupes.rows.length);
        if (dupes.rows.length > 0) {
          console.log('Examples:', dupes.rows.slice(0, 3));
        }

        // Messages with errors
        const errors = await client.query(`
          SELECT COUNT(*) as count
          FROM messages
          WHERE conversation_id = $1
          AND status IN ('FAILED', 'ERROR')
        `, [cv.id]);
        console.log('Failed/Error messages:', errors.rows[0].count);
      }
    }

    // Check user chloetan@gmail.com
    console.log('\n=== USER: chloetan@gmail.com ===\n');
    const user = await client.query(`
      SELECT id, email, first_name, last_name, role, status, created_at, last_login_at
      FROM users WHERE email = 'chloetan@gmail.com'
    `);
    if (user.rows.length > 0) {
      const u = user.rows[0];
      console.log('User ID:', u.id);
      console.log('Email:', u.email);
      console.log('Name:', u.first_name, u.last_name);
      console.log('Role:', u.role);
      console.log('Status:', u.status);
      console.log('Created:', u.created_at);
      console.log('Last Login:', u.last_login_at);

      // Check user's game stats
      const stats = await client.query(`
        SELECT * FROM agent_game_stats WHERE user_id = $1
      `, [u.id]);
      if (stats.rows.length > 0) {
        console.log('\nGame Stats:', JSON.stringify(stats.rows[0], null, 2));
      } else {
        console.log('\nNo game stats found for this user');
      }

      // Check recent activity
      const activity = await client.query(`
        SELECT COUNT(*) as msg_count
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.assigned_user_id = $1
        AND m.direction = 'OUTBOUND'
        AND m.created_at > NOW() - INTERVAL '7 days'
      `, [u.id]);
      console.log('Messages sent (last 7 days):', activity.rows[0].msg_count);
    } else {
      console.log('User not found');
    }

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await client.end();
  }
}

debugGroup();
