
import { DiscordJSAdapter } from "@distube/discordjs";
import { YouTubePlugin } from "@distube/youtube";

import {
  Client,
  Events,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  InteractionContextType
} from "discord.js";

import { DisTube } from "distube";

// ==========================================
// CONFIGURAÇÃO DO BOT
// ==========================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("ERRO: Configure a variável TOKEN na Discloud.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ==========================================
// DISTUBE
// ==========================================

const distube = new DisTube({
  adapter: new DiscordJSAdapter(client),
  plugins: [new YouTubePlugin()],

  onDiagnostic: ({ severity, stage, message }) => {
    console.error(`[DisTube ${severity}] ${stage}: ${message}`);
  }
});

// ==========================================
// COMANDOS SLASH
// ==========================================

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Tocar uma música ou playlist")
    .addStringOption(option =>
      option
        .setName("musica")
        .setDescription("Nome ou link da música")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pausar a música"),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Continuar a música"),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Pular a música atual"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Parar a música e limpar a fila"),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Desconectar o bot do canal de voz"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Mostrar a fila de músicas"),

  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Mostrar a música atual")
].map(command =>
  command.setContexts(InteractionContextType.Guild).toJSON()
);

// ==========================================
// EMBEDS
// ==========================================

function createEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getQueue(guildId) {
  return distube.getQueue(guildId);
}

// ==========================================
// EVENTOS DO DISTUBE
// ==========================================

// Música iniciada
distube.on("queue.item.started", async ({ item }) => {
  try {
    const channelId = item.metadata?.textChannelId;
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const embed = createEmbed(
      "🎵 Tocando agora",
      `**${item.song.name}**\nDuração: ${item.song.formattedDuration}`,
      0x2ECC71
    );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Erro ao anunciar música:", error);
  }
});

// Erro ao carregar música
distube.on("queue.item.failed", ({ item, error }) => {
  console.error(`Erro na música ${item.song.name}:`, error);
});

// Fila finalizada
distube.on("queue.finished", ({ guildId }) => {
  console.log(`A fila do servidor ${guildId} terminou.`);
});

// ==========================================
// BOT ONLINE
// ==========================================

client.once(Events.ClientReady, async ready => {
  console.log(`Bot conectado como ${ready.user.tag}`);

  try {
    await ready.application.commands.set(commands);
    console.log("Comandos slash registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// ==========================================
// INTERAÇÕES
// ==========================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inCachedGuild()) return;

  const guildId = interaction.guildId;
  const command = interaction.commandName;

  try {

    // PLAY
    if (command === "play") {
      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: "❌ Entre em um canal de voz primeiro!",
          ephemeral: true
        });
      }

      const musica = interaction.options.getString("musica", true);

      await interaction.deferReply();

      const { items } = await distube.play(
        voiceChannel,
        musica,
        {
          metadata: {
            textChannelId: interaction.channelId
          }
        }
      );

      const embed = createEmbed(
        "🎶 Música adicionada",
        items.map(item =>
          `**${item.song.name}**\nDuração: ${item.song.formattedDuration}`
        ).join("\n\n"),
        0x2ECC71
      );

      return interaction.editReply({ embeds: [embed] });
    }

    // PAUSE
    if (command === "pause") {
      const queue = getQueue(guildId);

      if (!queue) {
        return interaction.reply("❌ Não existe música tocando.");
      }

      await queue.pause();

      return interaction.reply({
        embeds: [
          createEmbed("⏸️ Música pausada", "A reprodução foi pausada.")
        ]
      });
    }

    // RESUME
    if (command === "resume") {
      const queue = getQueue(guildId);

      if (!queue) {
        return interaction.reply("❌ Não existe música para continuar.");
      }

      await queue.resume();

      return interaction.reply({
        embeds: [
          createEmbed("▶️ Música retomada", "A reprodução foi retomada.", 0x2ECC71)
        ]
      });
    }

    // SKIP
    if (command === "skip") {
      const queue = getQueue(guildId);

      if (!queue) {
        return interaction.reply("❌ Não existe música tocando.");
      }

      await queue.skip();

      return interaction.reply({
        embeds: [
          createEmbed("⏭️ Música pulada", "A música atual foi pulada.")
        ]
      });
    }

    // STOP
    if (command === "stop") {
      const queue = getQueue(guildId);

      if (!queue) {
        return interaction.reply("❌ Não existe fila para parar.");
      }

      await queue.stop();

      return interaction.reply({
        embeds: [
          createEmbed("⏹️ Reprodução encerrada", "A fila foi limpa.")
        ]
      });
    }

    // LEAVE
    if (command === "leave") {
      if (!distube.voices.has(guildId)) {
        return interaction.reply("❌ O bot não está em um canal de voz.");
      }

      await distube.voices.leave(guildId);

      return interaction.reply({
        embeds: [
          createEmbed("👋 Desconectado", "Saí do canal de voz.")
        ]
      });
    }

    // QUEUE
    if (command === "queue") {
      const queue = getQueue(guildId);

      if (!queue) {
        return interaction.reply("❌ A fila está vazia.");
      }

      let description = "";

      if (queue.current) {
        description +=
          `🎵 **Tocando agora:**\n${queue.current.song.name}\n\n`;
      }

      if (queue.upcoming.length > 0) {
        description += "**📃 Próximas músicas:**\n";

        description += queue.upcoming
          .slice(0, 10)
          .map((item, index) =>
            `**${index + 1}.** ${item.song.name} — ${item.song.formattedDuration}`
          )
          .join("\n");

        if (queue.upcoming.length > 10) {
          description += `\n\nE mais ${queue.upcoming.length - 10} músicas...`;
        }
      } else {
        description += "Não existem próximas músicas na fila.";
      }

      return interaction.reply({
        embeds: [
          createEmbed("📃 Fila de músicas", description)
        ]
      });
    }

    // NOW PLAYING
    if (command === "nowplaying") {
      const queue = getQueue(guildId);

      if (!queue?.current) {
        return interaction.reply("❌ Não existe música tocando.");
      }

      const song = queue.current.song;

      const embed = createEmbed(
        "🎧 Tocando agora",
        `**${song.name}**\n\n⏱️ Duração: ${song.formattedDuration}\n📊 Estado: ${queue.status}`,
        0x2ECC71
      );

      if (song.url) {
        embed.setURL(song.url);
      }

      if (song.thumbnail) {
        embed.setThumbnail(song.thumbnail);
      }

      return interaction.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error(`Erro no comando /${command}:`, error);

    const message = "❌ Ocorreu um erro ao executar esse comando.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({
        content: message,
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==========================================
// LOGIN
// ==========================================

client.login(TOKEN);
