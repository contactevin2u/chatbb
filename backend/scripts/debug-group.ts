/**
 * Debug script for group chat issues
 * Run with: npx ts-node scripts/debug-group.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugGroupChats() {
  console.log('=== Fetching all group chats ===\n');

  // Find all group contacts
  const groupContacts = await prisma.contact.findMany({
    where: {
      isGroup: true,
    },
    include: {
      conversations: {
        include: {
          _count: {
            select: { messages: true }
          }
        }
      }
    },
    take: 20,
  });

  console.log('Found ' + groupContacts.length + ' group contacts:\n');

  for (const contact of groupContacts) {
    console.log('--- Group: ' + (contact.displayName || contact.identifier) + ' ---');
    console.log('  ID: ' + contact.id);
    console.log('  Identifier: ' + contact.identifier);
    console.log('  Channel Type: ' + contact.channelType);
    console.log('  Metadata: ' + JSON.stringify(contact.metadata, null, 2));
    console.log('  Conversations: ' + contact.conversations.length);

    for (const conv of contact.conversations) {
      console.log('    - Conv ID: ' + conv.id);
      console.log('      Status: ' + conv.status);
      console.log('      Messages: ' + conv._count.messages);
      console.log('      Last Message: ' + conv.lastMessageAt);
    }
    console.log('');
  }

  // Check for any messages with group metadata issues
  console.log('\n=== Recent group messages with metadata ===\n');

  const recentGroupMessages = await prisma.message.findMany({
    where: {
      conversation: {
        contact: {
          isGroup: true
        }
      }
    },
    include: {
      conversation: {
        include: {
          contact: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const msg of recentGroupMessages) {
    console.log('Message ID: ' + msg.id);
    console.log('  Direction: ' + msg.direction);
    console.log('  Group: ' + msg.conversation.contact.displayName);
    console.log('  Content: ' + JSON.stringify(msg.content).slice(0, 100) + '...');
    console.log('  Metadata: ' + JSON.stringify(msg.metadata, null, 2));
    console.log('  Created: ' + msg.createdAt);
    console.log('');
  }

  await prisma.$disconnect();
}

debugGroupChats().catch(console.error);
