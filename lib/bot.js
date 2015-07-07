var _ = require('underscore');
var slack = require('./slacker');
var slackbot = require('node-slackbot');

var OrderedDict;

OrderedDict = (function() {
  function OrderedDict() {
    this.m_keys = [];
    this.m_vals = {};
  }

  OrderedDict.prototype.hasKey = function(k) {
    return (k in this.m_vals);
  };

  OrderedDict.prototype.push = function(k, v) {
    if (!this.hasKey(k)) {
      this.m_keys.push(k);
    }
    return this.m_vals[k] = v;
  };

  OrderedDict.prototype.length = function() {
    return this.m_keys.length;
  };

  OrderedDict.prototype.keys = function() {
    return this.m_keys;
  };

  OrderedDict.prototype.val = function(k) {
    return this.m_vals[k];
  };

  OrderedDict.prototype.vals = function() {
    return this.m_vals;
  };

  return OrderedDict;

})();

/**
 * Slackbot to integrate JIRA.
 *
 * The main thing it does right now is auto-expand links, but since we are bringing in the JIRA plugin, there is more it can do
 *
 * See config-example.js for configuration
 *
 * To run:  node config-XXX.js   (where XXX is the name of your config
 *
 * See:
 * https://www.npmjs.com/package/node-slackbot
 * https://www.npmjs.com/package/jira
 */
var Bot = function (config) {
  this.config = _.defaults(config, {
    bot_name: "AliasBot",
    emoji: ":slack:",
    helpName: "ALIASHELP",
    post: true
  });

  this.slacker = new slack.Slacker({
    token: this.config.token
  });

  return this;
};

Bot.prototype.run = function () {
  var self = this,
      verbose = self.config.verbose,
      bot = new slackbot(this.config.token),
      pattern = "@(",
      len = _.keys(self.config.alias_maps).length,
      helpTxt = "The following aliases are supported: \n",
      contextStrippers = [
        /```+.*?[^`].*?```+/g,  // block quote
        /`.*?[^`\s].*?`/g  // single quote
      ],
      aliasRegex;

  console.log(len);

  _.each(self.config.alias_maps, function (value, key, obj) {
    pattern += key;
    pattern += "|";
    helpTxt += key + "\n\t[" + value.join(", ") + "]\n";
  });

  pattern += self.config.helpName + ")(?:$|[^a-zA-Z\\-_\\.])";
  helpTxt += " " + self.config.helpName;

  if (verbose) {
    console.log("Pattern is: " + pattern);
    console.log(helpTxt);
  }

  aliasRegex = new RegExp(pattern, "g");
  bot.use(function (message, cb) {
    var text;
    if ('message' == message.type && (text = message.text) != null && message.subtype != "bot_message") {
      var targetsODict = new OrderedDict(),
          msgs = [],
          textParts = [text],
          idx,
          match,
          showHelp = false;

      if (verbose) {
        console.log(message);
      }
      
      _.each(contextStrippers, function(stripper) {
        idx = 0;
        while (idx < textParts.length) {
          stripper.lastIndex = 0;
          text = textParts[idx];
          if (!(match = stripper.exec(text))) {
            idx++;
            continue;
          }
          if (match.index == 0) {
            // no prefix
            if (stripper.lastIndex < text.length) {
              // has suffix
              textParts[idx] = text.substring(stripper.lastIndex, text.length);
            } else {
              // no data
              textParts.splice(idx, 1);
            }
          } else {
            // prefix present
            textParts[idx] = text.substring(0, match.index);
            idx++;
            if (stripper.lastIndex < text.length) {
              // suffix present
              textParts.splice(idx, 0, text.substring(stripper.lastIndex, text.length));
            }
          }
        }
      });
      _.each(textParts, function(text) {
        var matchText,
            aliasTargets;
        aliasRegex.lastIndex = 0;
        while (match = aliasRegex.exec(text)) {
          matchText = match[1].trim();
          if (matchText != self.config.helpName) {
            aliasTargets = self.config.alias_maps[matchText];
            if (verbose) {
              console.log("Match: ");
              console.log(match);
              console.log(aliasTargets);
            }
            _.each(aliasTargets, function(aliasTarget) {
              targetsODict.push(aliasTarget, true);
            });
          } else {
            showHelp = true;
          }
          aliasRegex.lastIndex--;
        }
      });

      if (targetsODict.length() > 0) {
        msgs.push(targetsODict.keys().join(self.config.link_separator));
      }

      if (showHelp) {
        msgs.push(helpTxt);
      }

      if (msgs.length > 0){
        self.slacker.send('chat.postMessage', {
          channel: message.channel,
          parse: "all",
          text: msgs.join(self.config.link_separator) + " ^",
          username: self.config.bot_name,
          unfurl_links: false,
          link_names: 1,
          icon_emoji: self.config.emoji
        });
      }

    }
    cb();
  });
  bot.connect();
};

exports = module.exports.Bot = Bot;
