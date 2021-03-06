'use strict';

const dateFormat = require('date-format');
const os = require('os');
const util = require('util');

const eol = os.EOL || '\n';

const styles = {
  // styles
  bold: [1, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  // grayscale
  white: [37, 39],
  grey: [90, 39],
  black: [90, 39],
  // colors
  blue: [34, 39],
  cyan: [36, 39],
  green: [32, 39],
  magenta: [35, 39],
  red: [91, 39],
  yellow: [33, 39]
};

function colorizeStart(style) {
  return style ? `\x1B[${styles[style][0]}m` : '';
}

function colorizeEnd(style) {
  return style ? `\x1B[${styles[style][1]}m` : '';
}

/**
 * Taken from masylum's fork (https://github.com/masylum/log4js-node)
 */
function colorize(str, style) {
  return colorizeStart(style) + str + colorizeEnd(style);
}

function timestampLevelAndCategory(loggingEvent, colour, timezoneOffset) {
  return colorize(
    util.format(
      '[%s] [%s] %s - '
      , dateFormat.asString(loggingEvent.startTime, timezoneOffset)
      , loggingEvent.level
      , loggingEvent.categoryName
    )
    , colour
  );
}

/**
 * BasicLayout is a simple layout for storing the logs. The logs are stored
 * in following format:
 * <pre>
 * [startTime] [logLevel] categoryName - message\n
 * </pre>
 *
 * @author Stephan Strittmatter
 */
function basicLayout(loggingEvent, timezoneOffset) {
  return timestampLevelAndCategory(
    loggingEvent,
    undefined,
    timezoneOffset
  ) + util.format(...loggingEvent.data);
}

/**
 * colouredLayout - taken from masylum's fork.
 * same as basicLayout, but with colours.
 */
function colouredLayout(loggingEvent, timezoneOffset) {
  return timestampLevelAndCategory(
    loggingEvent,
    loggingEvent.level.colour,
    timezoneOffset
  ) + util.format(...loggingEvent.data);
}

function messagePassThroughLayout(loggingEvent) {
  return util.format(...loggingEvent.data);
}

function dummyLayout(loggingEvent) {
  return loggingEvent.data[0];
}

/**
 * PatternLayout
 * Format for specifiers is %[padding].[truncation][field]{[format]}
 * e.g. %5.10p - left pad the log level by 5 characters, up to a max of 10
 * Fields can be any of:
 *  - %r time in toLocaleTimeString format
 *  - %p log level
 *  - %c log category
 *  - %h hostname
 *  - %m log data
 *  - %d date in constious formats
 *  - %% %
 *  - %n newline
 *  - %z pid
 *  - %x{<tokenname>} add dynamic tokens to your log. Tokens are specified in the tokens parameter
 *  - %X{<tokenname>} add dynamic tokens to your log. Tokens are specified in logger context
 * You can use %[ and %] to define a colored block.
 *
 * Tokens are specified as simple key:value objects.
 * The key represents the token name whereas the value can be a string or function
 * which is called to extract the value to put in the log message. If token is not
 * found, it doesn't replace the field.
 *
 * A sample token would be: { 'pid' : function() { return process.pid; } }
 *
 * Takes a pattern string, array of tokens and returns a layout function.
 * @return {Function}
 * @param pattern
 * @param tokens
 * @param timezoneOffset
 *
 * @authors ['Stephan Strittmatter', 'Jan Schmidle']
 */
function patternLayout(pattern, tokens, timezoneOffset) {
  const TTCC_CONVERSION_PATTERN = '%r %p %c - %m%n';
  // @author Christian Jean - Added the 'ML' characters to REGEX
  const regex = /%(-?[0-9]+)?(\.?[0-9]+)?([[\]MLcdhmnprzxXy%])(\{([^}]+)\})?|([^%]+)/;

  pattern = pattern || TTCC_CONVERSION_PATTERN;

  function categoryName(loggingEvent, specifier) {
    let loggerName = loggingEvent.categoryName;
    if (specifier) {
      const precision = parseInt(specifier, 10);
      const loggerNameBits = loggerName.split('.');
      if (precision < loggerNameBits.length) {
        loggerName = loggerNameBits.slice(loggerNameBits.length - precision).join('.');
      }
    }
    return loggerName;
  }

  /**
   * Function from 'log4js-extend.js' v0.2.21
   *
   * @author Christian Jean
   */
  function getTrace(caller) {
    var original = Error.prepareStackTrace, error = {};
    Error.prepareStackTrace = prepareStackTrace;
    Error.captureStackTrace(error, caller || getTrace);
    var stack = error.stack;
    Error.prepareStackTrace = original;
    return stack;
  }


  function logStackTrace(stackTrace) {
    return;
    console.log("-----------------------------------------------------------------------------");
    console.log("Length: " + stackTrace.length);
    for (var i=0; i<stackTrace.length; i++) {
      console.log("Trace " + i + ": " + stackTrace[i]);
    }
  } 

  /**
   * @author Christian Jean
   */
  function prepareStackTrace(error, structuredStackTrace) {
    const MAGIC_OFFSET = 14;  // As long as the log4js library call stack doesn't change, this constant should work.

    logStackTrace(structuredStackTrace);

    if (!structuredStackTrace || structuredStackTrace.length < MAGIC_OFFSET) {
      return {
        name: "<M>",
        file: "<file>",
        line: 0,
        column: 0
      };
    } else {
      var trace = structuredStackTrace[MAGIC_OFFSET];
      return {
        name: trace.getMethodName() || trace.getFunctionName() || "<anonymous>",
        file: trace.getFileName(),
        line: trace.getLineNumber(),
        column: trace.getColumnNumber()
      };
    }
  }

  /**
   * @author Christian Jean
   */
  function formatMethod(loggingEvent, specifier) {
    var trace = getTrace();
    return trace.name;
  }

  /**
   * @author Christian Jean
   */
  function formatLineNumber(loggingEvent, specifier) {
    var trace = getTrace();
    return trace.line;
  }

  function formatAsDate(loggingEvent, specifier) {
    let format = dateFormat.ISO8601_FORMAT;
    if (specifier) {
      format = specifier;
      // Pick up special cases
      if (format === 'ISO8601') {
        format = dateFormat.ISO8601_FORMAT;
      } else if (format === 'ISO8601_WITH_TZ_OFFSET') {
        format = dateFormat.ISO8601_WITH_TZ_OFFSET_FORMAT;
      } else if (format === 'ABSOLUTE') {
        format = dateFormat.ABSOLUTETIME_FORMAT;
      } else if (format === 'DATE') {
        format = dateFormat.DATETIME_FORMAT;
      }
    }
    // Format the date
    return dateFormat.asString(format, loggingEvent.startTime, timezoneOffset);
  }

  function hostname() {
    return os.hostname().toString();
  }

  function formatMessage(loggingEvent) {
    return util.format(...loggingEvent.data);
  }

  function endOfLine() {
    return eol;
  }

  function logLevel(loggingEvent) {
    return loggingEvent.level.toString();
  }

  function startTime(loggingEvent) {
    return dateFormat.asString('hh:mm:ss', loggingEvent.startTime, timezoneOffset);
  }

  function startColour(loggingEvent) {
    return colorizeStart(loggingEvent.level.colour);
  }

  function endColour(loggingEvent) {
    return colorizeEnd(loggingEvent.level.colour);
  }

  function percent() {
    return '%';
  }

  function pid(loggingEvent) {
    return loggingEvent && loggingEvent.pid ? loggingEvent.pid.toString() : process.pid.toString();
  }

  function clusterInfo() {
    // this used to try to return the master and worker pids,
    // but it would never have worked because master pid is not available to workers
    // leaving this here to maintain compatibility for patterns
    return pid();
  }

  function userDefined(loggingEvent, specifier) {
    if (typeof tokens[specifier] !== 'undefined') {
      return typeof tokens[specifier] === 'function' ? tokens[specifier](loggingEvent) : tokens[specifier];
    }

    return null;
  }

  function contextDefined(loggingEvent, specifier) {
    const resolver = loggingEvent.context[specifier];

    if (typeof resolver !== 'undefined') {
      return typeof resolver === 'function' ? resolver(loggingEvent) : resolver;
    }

    return null;
  }

  /* eslint quote-props:0 */
  const replacers = {
    'M': formatMethod,      // @author Christian Jean
    'L': formatLineNumber,  // @author Christian Jean
    'c': categoryName,
    'd': formatAsDate,
    'h': hostname,
    'm': formatMessage,
    'n': endOfLine,
    'p': logLevel,
    'r': startTime,
    '[': startColour,
    ']': endColour,
    'y': clusterInfo,
    'z': pid,
    '%': percent,
    'x': userDefined,
    'X': contextDefined
  };

  function replaceToken(conversionCharacter, loggingEvent, specifier) {
    //console.log("replaceToken('" + conversionCharacter + "', ...)");
    return replacers[conversionCharacter](loggingEvent, specifier);
  }

  function truncate(truncation, toTruncate) {
    let len;
    if (truncation) {
      len = parseInt(truncation.substr(1), 10);
      return toTruncate.substring(0, len);
    }

    return toTruncate;
  }

  function pad(padding, toPad) {
    let len;
    if (padding) {
      if (padding.charAt(0) === '-') {
        len = parseInt(padding.substr(1), 10);
        // Right pad with spaces
        while (toPad.length < len) {
          toPad += ' ';
        }
      } else {
        len = parseInt(padding, 10);
        // Left pad with spaces
        while (toPad.length < len) {
          toPad = ` ${toPad}`;
        }
      }
    }
    return toPad;
  }

  function truncateAndPad(toTruncAndPad, truncation, padding) {
    let replacement = toTruncAndPad;
    replacement = truncate(truncation, replacement);
    replacement = pad(padding, replacement);
    return replacement;
  }

  return function (loggingEvent) {
    let formattedString = '';
    let result;
    let searchString = pattern;

    //console.log("### searchString: '" + searchString + "'");

    /* eslint no-cond-assign:0 */
    while ((result = regex.exec(searchString)) !== null) {
      // const matchedString = result[0];
      const padding = result[1];
      const truncation = result[2];
      const conversionCharacter = result[3];
      const specifier = result[5];
      const text = result[6];

      //console.log("@@@ result: " + JSON.stringify(result, null, 4));

      // Check if the pattern matched was just normal text
      if (text) {
        formattedString += text.toString();
      } else {
        // Create a raw replacement string based on the conversion
        // character and specifier
        const replacement = replaceToken(conversionCharacter, loggingEvent, specifier);
        formattedString += truncateAndPad(replacement, truncation, padding);
      }
      searchString = searchString.substr(result.index + result[0].length);
    }
    return formattedString;
  };
}

const layoutMakers = {
  messagePassThrough: function () {
    return messagePassThroughLayout;
  },
  basic: function () {
    return basicLayout;
  },
  colored: function () {
    return colouredLayout;
  },
  coloured: function () {
    return colouredLayout;
  },
  pattern: function (config) {
    return patternLayout(config && config.pattern, config && config.tokens);
  },
  dummy: function () {
    return dummyLayout;
  }
};

module.exports = {
  basicLayout,
  messagePassThroughLayout,
  patternLayout,
  colouredLayout,
  coloredLayout: colouredLayout,
  dummyLayout,
  addLayout: function (name, serializerGenerator) {
    layoutMakers[name] = serializerGenerator;
  },
  layout: function (name, config) {
    return layoutMakers[name] && layoutMakers[name](config);
  }
};
