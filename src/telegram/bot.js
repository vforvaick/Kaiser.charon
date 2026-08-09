import TelegramBot from 'node-telegram-bot-api';
import { TELEGRAM_BOT_TOKEN, DISABLE_TELEGRAM_POLLING } from '../config.js';

export const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: !DISABLE_TELEGRAM_POLLING });

