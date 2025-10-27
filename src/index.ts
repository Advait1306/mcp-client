#!/usr/bin/env node

import { MenuSystem } from './menu-system.js';

async function main() {
  try {
    const menu = new MenuSystem();
    await menu.start();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
