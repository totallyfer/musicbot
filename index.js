
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  InteractionContextType,
  Events,
  EmbedBuilder
} = require("discord.js");

const { DisTube, DisTubeError } = require("distube");
const { DiscordJSAdapter } = require("@distube/discordjs");
const { YouTubePlugin } = require("@distube/youtube");

// =====================================
// CONFIGURAÇÕES
// =====================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  throw new Error("Configure a variável TOKEN na Discloud.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// =====================================
// SISTEMA DE MÚSICA
// =====================================

const distube = new DisTube({
  adapter: new DiscordJSAdapter(client),
  plugins: [new YouTubePlugin()]
});

// =====================================
// COMANDOS SLASH
// =====================================

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Tocar uma música")
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
    .setDescription("Parar a reprodução e limpar a fila"),

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

const musicCommandNames = new Set(commands.map(command => command.name));

// =====================================
// BOT ONLINE E REGISTRO DOS COMANDOS
// =====================================

client.once(Events.ClientReady, async ready => {
  console.log(`Bot conectado como ${ready.user.tag}`);

  try {
    // Preserva os outros comandos globais já registrados.
    const existing = await ready.application.commands.fetch();

    const merged = [
      ...existing
        .filter(command => !musicCommandNames.has(command.name))
        .map(command => command.toJSON()),
      ...commands
    ];

    await ready.application.commands.set(merged);

    console.log("Comandos de música registrados!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// =====================================
// ANUNCIAR MÚSICA QUE COMEÇOU
// =====================================

distube.on("queue.item.started", async ({ item }) => {
  try {
    const channel = await client.channels.fetch(
      item.metadata.textChannelId
    );

    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🎶 Tocando agora")
      .setDescription(`**${item.song.name}**`)
      .addFields(
        {
          name: "Duração",
          value: item.song.formattedDuration || "Desconhecida",
          inline: true
        },
        {
          name: "Solicitado por",
          value: `<@${item.metadata.userId}>`,
          inline: true
        }
      )
      .setFooter({ text: "Sistema de música" });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Erro ao anunciar música:", error);
  }
});

// =====================================
// INTERAÇÕES
// =====================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) return;

  const command = interaction.commandName;
  const guildId = interaction.guildId;

  try {

    // PLAY
    if (command === "play") {
      const member = await interaction.guild.members.fetch(
        interaction.user.id
      );

      const voiceChannel = member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: "❌ Entre em um canal de voz primeiro!",
          ephemeral: true
        });
      }

      const music = interaction.options.getString("musica", true);

      await interaction.deferReply();

      const result = await distube.play(
        voiceChannel,
        music,
        {
          metadata: {
            textChannelId: interaction.channelId,
            userId: interaction.user.id
          }
        }
      );

      return interaction.editReply(
        `✅ ${result.items.length} música(s) adicionada(s) à fila!`
      );
    }

    const queue = distube.getQueue(guildId);

    // PAUSE
    if (command === "pause") {
      if (!queue) {
        return interaction.reply("❌ Não existe música tocando.");
      }

      await interaction.deferReply();
      await queue.pause();

      return interaction.editReply("⏸️ Música pausada!");
    }

    // RESUME
    if (command === "resume") {
      if (!queue) {
        return interaction.reply("❌ Não existe música na fila.");
      }

      await interaction.deferReply();
      await queue.resume();

      return interaction.editReply("▶️ Música retomada!");
    }

    // SKIP
    if (command === "skip") {
      if (!queue) {
        return interaction.reply("❌ Não existe música para pular.");
      }

      await interaction.deferReply();

      const next = await queue.skip();

      return interaction.editReply(
        next
          ? `⏭️ Música pulada! Próxima: **${next.song.name}**`
          : "⏭️ Música pulada! Não há outra música na fila."
      );
    }

    // STOP
    if (command === "stop") {
      if (!queue) {
        return interaction.reply("❌ Não existe reprodução ativa.");
      }

      await queue.stop();

      return interaction.reply("⏹️ Reprodução parada e fila limpa!");
    }

    // LEAVE
    if (command === "leave") {
      if (!distube.voices.get(guildId)) {
        return interaction.reply("❌ Não estou em um canal de voz.");
      }

      await distube.voices.leave(guildId);

      return interaction.reply("👋 Desconectado do canal de voz!");
    }

    // QUEUE
    if (command === "queue") {
      if (!queue) {
        return interaction.reply("❌ A fila está vazia.");
      }

      const lines = [];

      if (queue.current) {
        lines.push(
          `🎵 **Tocando agora:** ${queue.current.song.name}`
        );
      }

      if (queue.upcoming.length) {
        lines.push("\n📋 **Próximas músicas:**");

        queue.upcoming.slice(0, 10).forEach((item, index) => {
          lines.push(
            `**${index + 1}.** ${item.song.name}`
          );
        });

        if (queue.upcoming.length > 10) {
          lines.push(
            `\nE mais ${queue.upcoming.length - 10} música(s)...`
          );
        }
      } else {
        lines.push("\nNão existem próximas músicas.");
      }

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🎶 Fila de músicas")
        .setDescription(lines.join("\n"));

      return interaction.reply({ embeds: [embed] });
    }

    // NOW PLAYING
    if (command === "nowplaying") {
      if (!queue || !queue.current) {
        return interaction.reply("❌ Nenhuma música está tocando.");
      }

      const song = queue.current.song;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🎵 Música atual")
        .setDescription(`**${song.name}**`)
        .addFields({
          name: "Duração",
          value: song.formattedDuration || "Desconhecida"
        });

      return interaction.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error("Erro no comando de música:", error);

    const message = DisTubeError.is(error)
      ? `❌ Não foi possível executar: ${error.message}`
      : "❌ Ocorreu um erro ao executar o comando.";

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

// =====================================
// ERROS E LOGIN
// =====================================

client.on("error", error => {
  console.error("Erro do Discord:", error);
});

process.on("unhandledRejection", error => {
  console.error("Erro não tratado:", error);
});

client.login(TOKEN);
