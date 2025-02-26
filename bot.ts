import "dotenv/config";
import { Bot, Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import {
    CommandGroup,
    commandNotFound,
    type CommandsFlavor,
} from "@grammyjs/commands";

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

const bot = new Bot(process.env.BOT_TOKEN);

const commands = new CommandGroup();

commands.command(
    "start",
    "Start the bot",
    async (ctx) =>
        await ctx.reply(
            "Hello! Welcome to Yet Yet Another Urban Dictionary bot!",
        ),
);
commands.command(
    "define_urban",
    "Define a word using Urban Dictionary",
    async (ctx) => {
        const word = ctx.match;
        const definitions = await defineWord(word);
    },
);

commands.command("help", "Show help", async (ctx) => {
    await ctx.reply(help, { parse_mode: "MarkdownV2" });
});
commands.command(
    "about",
    "About the bot",
    async (ctx) =>
        await ctx.reply(
            "Yet Yet Another Urban Dictionary bot that defines words using Urban Dictionary. Created by @USLTD",
        ),
);

bot.use(commands);

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
