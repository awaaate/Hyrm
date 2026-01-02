#!/usr/bin/env node
/**
 * Playwright MCP Server
 * 
 * A Model Context Protocol server that provides browser automation capabilities
 * using Playwright. Enables AI agents to interact with web pages.
 * 
 * Features:
 * - Browser navigation
 * - Screenshot capture
 * - Page content extraction
 * - Element interaction (click, type, etc.)
 * - Form filling
 * - JavaScript execution
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, Browser, Page, BrowserContext } from "playwright";

// Global browser state
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

// Browser management
async function ensureBrowser(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });
    page = await context.newPage();
  }
  if (!page) {
    page = await context!.newPage();
  }
  return page;
}

async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "playwright_navigate",
    description: "Navigate to a URL in the browser. Returns page title and URL after navigation.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (must include protocol, e.g., https://)",
        },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"],
          description: "When to consider navigation complete (default: domcontentloaded)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "playwright_screenshot",
    description: "Take a screenshot of the current page. Returns the screenshot as base64 encoded image.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description: "Whether to capture the full scrollable page (default: false)",
        },
        selector: {
          type: "string",
          description: "Optional CSS selector to screenshot a specific element",
        },
      },
    },
  },
  {
    name: "playwright_get_content",
    description: "Extract text content from the current page. Can extract all text or specific elements.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector to extract content from specific elements",
        },
        includeLinks: {
          type: "boolean",
          description: "Include href values for links (default: false)",
        },
      },
    },
  },
  {
    name: "playwright_click",
    description: "Click on an element on the page using a CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the element to click",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "playwright_type",
    description: "Type text into an input field or textarea.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the input element",
        },
        text: {
          type: "string",
          description: "Text to type into the element",
        },
        clear: {
          type: "boolean",
          description: "Clear existing content before typing (default: true)",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "playwright_evaluate",
    description: "Execute JavaScript code in the browser context and return the result.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "JavaScript code to execute. Can return a value.",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "playwright_wait",
    description: "Wait for an element to appear or a condition to be met.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to wait for",
        },
        state: {
          type: "string",
          enum: ["attached", "detached", "visible", "hidden"],
          description: "State to wait for (default: visible)",
        },
        timeout: {
          type: "number",
          description: "Maximum time to wait in milliseconds (default: 30000)",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "playwright_get_attribute",
    description: "Get an attribute value from an element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the element",
        },
        attribute: {
          type: "string",
          description: "Name of the attribute to get",
        },
      },
      required: ["selector", "attribute"],
    },
  },
  {
    name: "playwright_fill_form",
    description: "Fill multiple form fields at once.",
    inputSchema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          description: "Object mapping selectors to values, e.g., {'#email': 'test@example.com'}",
          additionalProperties: { type: "string" },
        },
        submit: {
          type: "boolean",
          description: "Whether to submit the form after filling (default: false)",
        },
        submitSelector: {
          type: "string",
          description: "Selector for submit button (required if submit is true)",
        },
      },
      required: ["fields"],
    },
  },
  {
    name: "playwright_scroll",
    description: "Scroll the page or a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Direction to scroll",
        },
        amount: {
          type: "number",
          description: "Amount to scroll in pixels (default: 500)",
        },
        selector: {
          type: "string",
          description: "Optional selector of element to scroll within",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "playwright_close",
    description: "Close the browser and clean up resources.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Tool execution handlers
async function handleNavigate(args: { url: string; waitUntil?: string }): Promise<string> {
  const page = await ensureBrowser();
  await page.goto(args.url, {
    waitUntil: (args.waitUntil as "load" | "domcontentloaded" | "networkidle") || "domcontentloaded",
  });
  const title = await page.title();
  const url = page.url();
  return JSON.stringify({
    success: true,
    title,
    url,
    message: `Navigated to ${url}`,
  });
}

async function handleScreenshot(args: { fullPage?: boolean; selector?: string }): Promise<string> {
  const page = await ensureBrowser();
  let screenshot: Buffer;

  if (args.selector) {
    const element = await page.$(args.selector);
    if (!element) {
      return JSON.stringify({ success: false, error: `Element not found: ${args.selector}` });
    }
    screenshot = await element.screenshot();
  } else {
    screenshot = await page.screenshot({ fullPage: args.fullPage ?? false });
  }

  return JSON.stringify({
    success: true,
    image: screenshot.toString("base64"),
    mimeType: "image/png",
  });
}

async function handleGetContent(args: { selector?: string; includeLinks?: boolean }): Promise<string> {
  const page = await ensureBrowser();

  if (args.selector) {
    const elements = await page.$$(args.selector);
    const contents = await Promise.all(
      elements.map(async (el) => {
        const text = await el.textContent();
        if (args.includeLinks) {
          const href = await el.getAttribute("href");
          return { text: text?.trim(), href };
        }
        return text?.trim();
      })
    );
    return JSON.stringify({ success: true, contents: contents.filter(Boolean) });
  }

  // Get full page content
  const content = await page.evaluate(() => {
    // Get main content, excluding scripts, styles, etc.
    const body = document.body;
    const clone = body.cloneNode(true) as HTMLElement;
    
    // Remove unwanted elements
    ["script", "style", "noscript", "iframe"].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    
    return clone.innerText;
  });

  return JSON.stringify({
    success: true,
    content: content.trim(),
    url: page.url(),
    title: await page.title(),
  });
}

async function handleClick(args: { selector: string }): Promise<string> {
  const page = await ensureBrowser();
  try {
    await page.click(args.selector);
    return JSON.stringify({ success: true, message: `Clicked on ${args.selector}` });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleType(args: { selector: string; text: string; clear?: boolean }): Promise<string> {
  const page = await ensureBrowser();
  try {
    if (args.clear !== false) {
      await page.fill(args.selector, "");
    }
    await page.type(args.selector, args.text);
    return JSON.stringify({ success: true, message: `Typed "${args.text}" into ${args.selector}` });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleEvaluate(args: { script: string }): Promise<string> {
  const page = await ensureBrowser();
  try {
    const result = await page.evaluate(args.script);
    return JSON.stringify({ success: true, result });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleWait(args: { selector: string; state?: string; timeout?: number }): Promise<string> {
  const page = await ensureBrowser();
  try {
    await page.waitForSelector(args.selector, {
      state: (args.state as "attached" | "detached" | "visible" | "hidden") || "visible",
      timeout: args.timeout || 30000,
    });
    return JSON.stringify({ success: true, message: `Element ${args.selector} is ${args.state || "visible"}` });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleGetAttribute(args: { selector: string; attribute: string }): Promise<string> {
  const page = await ensureBrowser();
  try {
    const element = await page.$(args.selector);
    if (!element) {
      return JSON.stringify({ success: false, error: `Element not found: ${args.selector}` });
    }
    const value = await element.getAttribute(args.attribute);
    return JSON.stringify({ success: true, attribute: args.attribute, value });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleFillForm(args: { fields: Record<string, string>; submit?: boolean; submitSelector?: string }): Promise<string> {
  const page = await ensureBrowser();
  try {
    for (const [selector, value] of Object.entries(args.fields)) {
      await page.fill(selector, value);
    }
    
    if (args.submit && args.submitSelector) {
      await page.click(args.submitSelector);
      await page.waitForLoadState("domcontentloaded");
    }
    
    return JSON.stringify({
      success: true,
      message: `Filled ${Object.keys(args.fields).length} fields`,
      submitted: args.submit || false,
    });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleScroll(args: { direction: string; amount?: number; selector?: string }): Promise<string> {
  const page = await ensureBrowser();
  const amount = args.amount || 500;
  
  try {
    if (args.selector) {
      const element = await page.$(args.selector);
      if (!element) {
        return JSON.stringify({ success: false, error: `Element not found: ${args.selector}` });
      }
      await element.evaluate((el, { direction, amount }) => {
        const scrollMap: Record<string, [number, number]> = {
          up: [0, -amount],
          down: [0, amount],
          left: [-amount, 0],
          right: [amount, 0],
        };
        const [x, y] = scrollMap[direction] || [0, 0];
        el.scrollBy(x, y);
      }, { direction: args.direction, amount });
    } else {
      const scrollMap: Record<string, [number, number]> = {
        up: [0, -amount],
        down: [0, amount],
        left: [-amount, 0],
        right: [amount, 0],
      };
      const [x, y] = scrollMap[args.direction] || [0, 0];
      await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x, y });
    }
    
    return JSON.stringify({ success: true, message: `Scrolled ${args.direction} by ${amount}px` });
  } catch (error) {
    return JSON.stringify({ success: false, error: String(error) });
  }
}

async function handleClose(): Promise<string> {
  await closeBrowser();
  return JSON.stringify({ success: true, message: "Browser closed" });
}

// Create MCP server
const server = new Server(
  {
    name: "playwright-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "playwright_navigate":
        result = await handleNavigate(args as any);
        break;
      case "playwright_screenshot":
        result = await handleScreenshot(args as any);
        break;
      case "playwright_get_content":
        result = await handleGetContent(args as any);
        break;
      case "playwright_click":
        result = await handleClick(args as any);
        break;
      case "playwright_type":
        result = await handleType(args as any);
        break;
      case "playwright_evaluate":
        result = await handleEvaluate(args as any);
        break;
      case "playwright_wait":
        result = await handleWait(args as any);
        break;
      case "playwright_get_attribute":
        result = await handleGetAttribute(args as any);
        break;
      case "playwright_fill_form":
        result = await handleFillForm(args as any);
        break;
      case "playwright_scroll":
        result = await handleScroll(args as any);
        break;
      case "playwright_close":
        result = await handleClose();
        break;
      default:
        result = JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: String(error) }) }],
      isError: true,
    };
  }
});

// Handle server shutdown
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Playwright MCP server started");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
