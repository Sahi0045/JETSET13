#!/usr/bin/env node

/**
 * Chatbot Setup Verification Script
 * Run this to verify your chatbot is configured correctly
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
};

async function testEnvironmentVariables() {
  console.log('\n📋 Checking Environment Variables...\n');

  const required = [
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET',
  ];

  let allPresent = true;

  for (const key of required) {
    if (process.env[key]) {
      log.success(`${key} is set`);
    } else {
      log.error(`${key} is missing`);
      allPresent = false;
    }
  }

  return allPresent;
}

async function testGeminiAPI() {
  console.log('\n🤖 Testing Gemini API Connection...\n');

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    log.info(`Sending test prompt to Gemini (${modelName})...`);
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Say "Hello" in one word.'
    });

    const text = response.text;

    log.success(`Gemini API is working! Response: "${text.trim()}"`);
    return true;
  } catch (error) {
    log.error(`Gemini API failed: ${error.message}`);

    if (error.message.includes('API key')) {
      log.warning('Check your GEMINI_API_KEY in .env file');
      log.info('Get a key at: https://aistudio.google.com/app/apikey');
    }

    return false;
  }
}

async function testSupabaseConnection() {
  console.log('\n🗄️  Testing Supabase Connection...\n');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    log.info('Connecting to Supabase...');

    // Test basic connection
    const { error: healthError } = await supabase.from('users').select('count').limit(1);

    if (healthError && !healthError.message.includes('relation')) {
      throw healthError;
    }

    log.success('Supabase connection is working!');

    // Check for chatbot tables
    log.info('Checking for chatbot tables...');

    const tables = [
      'chat_sessions',
      'chat_messages',
      'chat_feedback',
      'content_embeddings',
      'chatbot_analytics',
    ];

    let allTablesExist = true;

    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(1);

      if (error) {
        if (error.message.includes('relation') || error.message.includes('does not exist')) {
          log.error(`Table "${table}" does not exist`);
          allTablesExist = false;
        } else {
          log.success(`Table "${table}" exists`);
        }
      } else {
        log.success(`Table "${table}" exists`);
      }
    }

    if (!allTablesExist) {
      log.warning('Some tables are missing. Run the migration:');
      log.info('1. Open: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/sql');
      log.info('2. Copy contents of: backend/migrations/chat-tables.sql');
      log.info('3. Paste and click "Run"');
    }

    return allTablesExist;
  } catch (error) {
    log.error(`Supabase connection failed: ${error.message}`);
    log.warning('Check your SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
    return false;
  }
}

async function testPgVector() {
  console.log('\n🔍 Testing pgvector Extension...\n');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Try to query content_embeddings which uses vector type
    const { error } = await supabase
      .from('content_embeddings')
      .select('id')
      .limit(1);

    if (error) {
      if (error.message.includes('type "vector" does not exist')) {
        log.error('pgvector extension is not enabled');
        log.warning('Run this in Supabase SQL Editor:');
        log.info('CREATE EXTENSION IF NOT EXISTS vector;');
        return false;
      } else if (error.message.includes('relation') || error.message.includes('does not exist')) {
        log.warning('content_embeddings table does not exist (run migration first)');
        return false;
      }
    }

    log.success('pgvector extension is enabled');
    return true;
  } catch (error) {
    log.error(`pgvector test failed: ${error.message}`);
    return false;
  }
}

async function testFileStructure() {
  console.log('\n📁 Checking File Structure...\n');

  const { existsSync } = await import('fs');

  const files = [
    'config/chatbot.js',
    'backend/models/chat.model.js',
    'backend/services/gemini.service.js',
    'backend/services/query-classifier.js',
    'backend/services/response-generator.js',
    'backend/controllers/chat.controller.js',
    'api/chat/index.js',
    'frontend/components/ChatBot/ChatWidget.jsx',
    'frontend/hooks/useChat.js',
    'frontend/utils/chat-api.js',
  ];

  let allExist = true;

  for (const file of files) {
    if (existsSync(file)) {
      log.success(file);
    } else {
      log.error(`${file} is missing`);
      allExist = false;
    }
  }

  return allExist;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   Gemini AI Chatbot - Setup Verification             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);

  const results = {
    env: await testEnvironmentVariables(),
    files: await testFileStructure(),
    gemini: await testGeminiAPI(),
    supabase: await testSupabaseConnection(),
    pgvector: await testPgVector(),
  };

  console.log('\n' + '═'.repeat(55));
  console.log('\n📊 Test Results Summary:\n');

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  console.log(`Environment Variables: ${results.env ? '✓' : '✗'}`);
  console.log(`File Structure: ${results.files ? '✓' : '✗'}`);
  console.log(`Gemini API: ${results.gemini ? '✓' : '✗'}`);
  console.log(`Supabase Connection: ${results.supabase ? '✓' : '✗'}`);
  console.log(`pgvector Extension: ${results.pgvector ? '✓' : '✗'}`);

  console.log(`\n${colors.blue}Score: ${passed}/${total} tests passed${colors.reset}\n`);

  if (passed === total) {
    console.log(`${colors.green}🎉 All tests passed! Your chatbot is ready to use.${colors.reset}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: npm run dev`);
    console.log(`  2. Open: http://localhost:5173`);
    console.log(`  3. Click the blue chat button in the bottom-right corner\n`);
  } else {
    console.log(`${colors.yellow}⚠️  Some tests failed. Please fix the issues above.${colors.reset}\n`);
    console.log(`See CHATBOT_SETUP_GUIDE.md for detailed instructions.\n`);
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
