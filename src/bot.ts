import { Bot, Context, session, SessionFlavor } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { CommandGroup, commandNotFound } from "@grammyjs/commands";
import { Menu } from "@grammyjs/menu";
import { InlineQueryResultArticle } from "@grammyjs/types/inline";

type Definition = {
    definition: string;
    permalink: string;
    thumbs_up: number;
    author: string;
    word: string;
    defid: number;
    current_vote: string;
    written_on: string;
    example: string;
    thumbs_down: number;
};

type Data = {
    list: Definition[];
};

const BOT_USERNAME = "YYAUDB_bot";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is unset");

const help = `
Here are the commands available:
- /start: Start the bot
- /define_urban: Define a word using Urban Dictionary
- /about: About the bot
- /help: Show help
`.trim();

const about = `
Yet Yet Another Urban Dictionary bot that defines words using Urban Dictionary. Created by [@USLTD](tg://user?id=882954222).
`.trim();

async function defineWord(word: string) {
    const url = `https://api.urbandictionary.com/v0/define?term=${word}`;

    const response = await fetch(url);
    const { list } = (await response.json()) as Data;

    return list;
}

interface SessionData {
    definitions: Definition[];
    index: number;
}

type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(token, {
    client: {
        // We accept the drawback of webhook replies for typing status.
        canUseWebhookReply: (method) => method === "sendChatAction",
    },
    botInfo: {
        id: 7322793556,
        is_bot: true,
        first_name: "Yet Yet Another Urban Dictionary Bot",
        username: "YYAUDB_bot",
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false,
    },
});

function initial(): SessionData {
    return { definitions: [], index: 0 };
}

// Use session to track the current index of definitions
bot.use(session({ initial }));

// Utility: Escape MarkdownV2 special characters
function escapeMarkdown(text: string) {
    return text.replace(/([_*\\[]()~`>#+-=|{}.!])/g, "\\$1");
}

// In private chats, convert bracketed terms into hyperlinks that deep link to /start
function convertToHyperlinks(text: string) {
    return text.replace(/\[([^\]]+)]/g, (match, term) => {
        const encodedTerm = encodeURIComponent(term);
        return `[${escapeMarkdown(term)}](https://t.me/${BOT_USERNAME}?start=define_${encodedTerm})`;
    });
}

// Extract unique hypertext terms from text (words inside square brackets)
function extractHypertexts(text: string) {
    const matches = text.match(/\[([^\]]+)]/g);
    if (matches) {
        return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
    }
    return [];
}

// Generate the definition message. The output depends on whether the chat is private.
function generateMessage(
    definitions: Definition[],
    index: number,
    isPrivate: boolean,
) {
    const entry = definitions[index];
    let defText, exampleText;
    if (isPrivate) {
        defText = convertToHyperlinks(entry.definition);
        exampleText = convertToHyperlinks(entry.example);
    } else {
        // In groups, simply remove the brackets
        defText = escapeMarkdown(
            entry.definition.replace(/\[([^\]]+)]/g, "$1"),
        );
        exampleText = escapeMarkdown(
            entry.example.replace(/\[([^\]]+)]/g, "$1"),
        );
    }
    return `📖 *Definition (${index + 1} of ${definitions.length}):*\n\n${defText}\n\n*Example:*\n${exampleText}\n\n👍 *${entry.thumbs_up}*  |  👎 *${entry.thumbs_down}*\n📌 [Source](${entry.permalink})\n✍️ _by ${escapeMarkdown(entry.author)}_`;
}

// Create a dynamic menu using the GrammyJS menu plugin
const menu = new Menu<BotContext>("definition-menu").dynamic((ctx, range) => {
    const isPrivate = ctx.chat?.type === "private";
    const index = ctx.session.index;
    const entry = ctx.session.definitions[index];

    // Navigation buttons (if there are multiple definitions)
    if (ctx.session.definitions.length > 1) {
        if (index > 0)
            range.text("⬅️ Previous", (ctx) => {
                ctx.session.index--;
                return {
                    text: generateMessage(
                        ctx.session.definitions,
                        ctx.session.index,
                        isPrivate,
                    ),
                    options: { parse_mode: "MarkdownV2", reply_markup: menu },
                };
            });
        if (index < ctx.session.definitions.length - 1)
            range.text("Next ➡️", (ctx) => {
                ctx.session.index++;
                return {
                    text: generateMessage(
                        ctx.session.definitions,
                        ctx.session.index,
                        isPrivate,
                    ),
                    options: { parse_mode: "MarkdownV2", reply_markup: menu },
                };
            });
    }

    // In group chats, add inline buttons for nested definitions
    if (!isPrivate) {
        const hypertexts = extractHypertexts(
            entry.definition + " " + entry.example,
        );
        if (hypertexts.length > 0) {
            hypertexts.forEach((term) => {
                // Each button uses switch_inline_query_current_chat so that the inline query is triggered in the current group
                range.switchInlineCurrent(
                    term,
                    `define_${encodeURIComponent(term)}`,
                );
            });
        }
    }

    // Extra UI: a Close button to remove the message
    range.text("❌ Close", async (ctx) => {
        await ctx.deleteMessage();
        return true;
    });
});

bot.use(menu);

const commands = new CommandGroup<BotContext>();

commands.command("start", "Start the bot", async (ctx) => {
    const args = ctx.message?.text.split(" ");
    if (args && args.length > 1 && args[1].startsWith("define_")) {
        const term = decodeURIComponent(args[1].slice("define_".length));
        // Perform a lookup for 'term' here. Currently, a stub response is sent.
        const message = `📖 *Definition for ${escapeMarkdown(term)}:*\n\n_No definition found for "${escapeMarkdown(term)}"._`;
        await ctx.reply(message, { parse_mode: "MarkdownV2" });
    } else {
        await ctx.reply("Welcome! Use /define to get started.");
    }
});
commands.command(
    "define_urban",
    "Define a word using Urban Dictionary",
    async (ctx) => {
        ctx.session.index = 0;
        const isPrivate = ctx.chat.type === "private";
        const word = ctx.match;
        if (!word) {
            await ctx.reply("Please provide a word to define.");
        } else {
            const definitions = await defineWord(word);

            if (definitions.length === 0) {
                await ctx.reply("No definitions found for the word.");
            } else {
                await ctx.reply(generateMessage(definitions, 0, isPrivate), {
                    parse_mode: "MarkdownV2",
                    reply_markup: menu,
                });
            }
        }
    },
);
commands.command("help", "Show help", async (ctx) => {
    await ctx.reply(help, { parse_mode: "MarkdownV2" });
});
commands.command(
    "about",
    "About the bot",
    async (ctx) => await ctx.reply(about, { parse_mode: "MarkdownV2" }),
);

bot.use(commands);

// Handle inline queries triggered by switch_inline_query_current_chat in group chats
bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query;
    if (query.startsWith("define_")) {
        const term = decodeURIComponent(query.slice("define_".length));
        // Here, you would look up the definition for 'term'. For demonstration, we return a stub inline result.
        const results: InlineQueryResultArticle[] = [
            {
                type: "article",
                id: "1",
                title: `Definition for ${term}`,
                input_message_content: {
                    message_text: `📖 *Definition for ${escapeMarkdown(term)}:*\n\n_No definition found for "${escapeMarkdown(term)}"._`,
                    parse_mode: "MarkdownV2",
                },
                description: "Tap to send the definition",
            },
        ];
        return ctx.answerInlineQuery(results);
    }
});

await commands.setCommands(bot);

bot.filter(commandNotFound(commands)).use(async (ctx) => {
    if (ctx.commandSuggestion) {
        await ctx.reply(
            `Hmm... I don't know that command. Did you mean ${ctx.commandSuggestion}?`,
        );
        return;
    }
    await ctx.reply("Oops... I don't know that command :/");
});

bot.api.config.use(autoRetry());

await bot.start();
