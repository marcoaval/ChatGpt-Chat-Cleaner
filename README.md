# ChatGPT & Claude Chat Cleaner

This is a Tampermonkey script for cleaning up ChatGPT and Claude conversations faster while still reviewing everything before anything gets deleted.

The script looks through conversations currently loaded in the sidebar, checks their titles against cleanup and protection filters, and gives you a review list before deletion.

## Supported sites

- ChatGPT
- Claude

## What it does

- Adds a **Chat Cleaner** button to ChatGPT and Claude
- Looks through chats currently loaded in the sidebar
- Suggests chats for cleanup based on title filters
- Protects chats that match protected filters
- Lets you review every chat before deleting
- Includes **Select suggested chats**, **Select all**, and **Deselect all** controls
- Includes a built-in **Manage filters** screen
- Lets you add or remove suggested and protected words or phrases without editing the code
- Saves custom filters in Tampermonkey so they stay available between sessions
- Requires confirmation before deleting anything
- Only deletes chats you selected
- Supports light and dark themes

## Installation

You need the Tampermonkey extension installed in your browser.

After that:

1. Open the raw userscript file from this repository
2. Install it through Tampermonkey
3. Refresh ChatGPT or Claude

You should see a **🧹 Chat Cleaner** button in the bottom-right corner.

## How to use it

Open ChatGPT or Claude and make sure the conversation sidebar is visible.

Click:

**🧹 Chat Cleaner**

The cleaner will scan the conversations currently loaded in the sidebar and classify them as:

- **Suggested** — matches a suggested cleanup filter and does not match a protected filter
- **Protected** — matches a protected filter and is not automatically selected
- **Review** — does not currently match either filter type

Use **Select suggested chats** to select the conversations the cleaner recommends for cleanup, or use **Select all** and **Deselect all** to control the list manually.

When you are ready, click **Delete selected** and confirm.

## Managing filters

Click **Manage filters** inside the cleaner to change how chats are classified.

There are two filter groups:

### Suggested cleanup filters

If a chat title contains one of these words or phrases, the cleaner suggests it for deletion and preselects it unless a protected filter also matches.

Default examples include:

- health
- medical
- relationship
- family
- pet
- housing
- job
- finance
- shopping

### Protected filters

If a chat title contains one of these words or phrases, the chat stays unselected even if a suggested cleanup filter also matches.

Default examples include:

- class
- course
- assignment
- lab
- github
- python
- programming
- cybersecurity
- project
- study

You can add a word or phrase from the filter screen, remove existing filters with the **×** button, or use **Reset defaults** to restore the original lists.

Custom filters are saved in Tampermonkey storage, so you do not need to edit the userscript to keep your changes.

## Important

The script does not understand the full meaning of a conversation. It mainly checks the conversation title against the current filters.

Always review the selected chats before deleting anything.

Deleted chats cannot be restored by this script.

## Limitations

The script only scans conversations that are currently loaded in the sidebar.

ChatGPT or Claude can change their website layouts at any time, which may require the script selectors to be updated.

The script is designed for the browser versions of ChatGPT and Claude. It does not run inside the native mobile apps.

## Privacy

The script runs locally in your browser through Tampermonkey.

Conversation titles are not sent to another server by this script.

Custom filters are stored through Tampermonkey's script storage.

## Version

1.4.0

## Commercial Use

This project is free to use for personal, educational, research, and other non-commercial purposes.

If you want to use this project in a paid product, service, business, monetized project, or anything else that makes money, you need permission first.

Commercial licensing, royalties, or revenue-sharing terms would be handled separately in writing.

See the `LICENSE` file for the full terms.

## Disclaimer

This is an independent project and is not made, supported, or endorsed by OpenAI or Anthropic.
