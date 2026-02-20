/** @param {NS} ns */
export async function main(ns) {
    // ============================================================
    // CONFIGURATION (override with flags)
    // ============================================================
    const FLAGS = ns.flags([
        ["bet", 1e6],        // Bet amount per hand
        ["hands", 100],      // Max hands to play
        ["delay", 50],       // Delay between actions (ms)
    ]);

    const BET_AMOUNT = Number(FLAGS.bet) || 0;
    const MAX_HANDS = Number(FLAGS.hands) || 0;
    const DELAY_MS = Number(FLAGS.delay) || 50;

    // ============================================================
    // BASIC STRATEGY - Simple decision table
    // Returns: "hit", "stand", "double" (we ignore split for simplicity)
    // ============================================================
    function getAction(playerTotal, dealerUpcard, isSoft, canDouble) {
        // Soft hands (have an Ace counted as 11)
        if (isSoft) {
            if (playerTotal >= 19) return "stand";
            if (playerTotal === 18) {
                if (dealerUpcard >= 9) return "hit";
                return "stand";
            }
            // Soft 17 or less: always hit
            return "hit";
        }

        // Hard hands
        if (playerTotal >= 17) return "stand";
        if (playerTotal >= 13 && dealerUpcard <= 6) return "stand";
        if (playerTotal === 12 && dealerUpcard >= 4 && dealerUpcard <= 6) return "stand";

        // Double down opportunities
        if (canDouble) {
            if (playerTotal === 11) return "double";
            if (playerTotal === 10 && dealerUpcard <= 9) return "double";
            if (playerTotal === 9 && dealerUpcard >= 3 && dealerUpcard <= 6) return "double";
        }

        return "hit";
    }

    // ============================================================
    // DOM HELPERS - Find and click casino buttons
    // ============================================================
    const doc = eval("document");  // Bypass RAM cost

    function findButton(text) {
        const buttons = doc.querySelectorAll("button");
        for (const btn of buttons) {
            if (btn.textContent.toLowerCase().includes(text.toLowerCase())) {
                return btn;
            }
        }
        return null;
    }

    function clickButton(text) {
        const btn = findButton(text);
        if (btn && !btn.disabled) {
            btn.click();
            return true;
        }
        return false;
    }

    function getCardValue(cardText) {
        // Cards show as "2♠", "K♥", "A♦", etc.
        const rank = cardText.replace(/[♠♥♦♣]/g, "").trim();
        if (rank === "A") return 11;  // We'll handle soft hands separately
        if (["K", "Q", "J"].includes(rank)) return 10;
        return parseInt(rank) || 0;
    }

    function parseHand(cards) {
        let total = 0;
        let aces = 0;

        for (const card of cards) {
            const val = getCardValue(card);
            if (val === 11) aces++;
            total += val;
        }

        // Convert aces from 11 to 1 as needed
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }

        return { total, isSoft: aces > 0 && total <= 21 };
    }

    function getGameState() {
        // Find card displays - adjust selectors if they don't work
        const cardElements = doc.querySelectorAll("p");
        let playerCards = [];
        let dealerCards = [];

        for (const el of cardElements) {
            const text = el.textContent;
            // Look for card patterns (number/letter followed by suit)
            const cards = text.match(/[2-9TJQKA][♠♥♦♣]/g);
            if (cards) {
                // First set of cards is usually player, second is dealer
                // This may need adjustment based on actual UI
                if (playerCards.length === 0) {
                    playerCards = cards;
                } else {
                    dealerCards = cards;
                }
            }
        }

        return {
            player: parseHand(playerCards),
            dealerUpcard: dealerCards.length > 0 ? getCardValue(dealerCards[0]) : 0,
            playerCards,
            dealerCards
        };
    }

    // ============================================================
    // MAIN GAME LOOP
    // ============================================================
    ns.disableLog('ALL');
    ns.ui.openTail();

    ns.print("Starting Blackjack bot...");
    ns.print(`Betting $${ns.formatNumber(BET_AMOUNT)} per hand`);
    ns.print("Make sure you're at the casino in Aevum!");

    ns.print("Waiting 3 seconds...");
    await ns.sleep(3000);

    let handsPlayed = 0;
    let wins = 0;
    let losses = 0;

    while (handsPlayed < MAX_HANDS) {
        await ns.sleep(DELAY_MS);

        // Try to start a new game
        if (clickButton("Start")) {
            handsPlayed++;
            ns.print(`Hand #${handsPlayed}`);
            await ns.sleep(DELAY_MS * 2);
            continue;
        } else {
            ns.print("ERROR: Failed to find Start button");
        }

        // Check for game over buttons
        if (findButton("Play again")) {
            // Try to determine if we won or lost from the text
            const resultText = doc.body.textContent;
            if (resultText.includes("won") || resultText.includes("Win")) {
                wins++;
            } else if (resultText.includes("lost") || resultText.includes("Lose") || resultText.includes("Bust")) {
                losses++;
            }
            clickButton("Play again");
            await ns.sleep(DELAY_MS);
            continue;
        } else {
            ns.print("ERROR: Failed to find Play again button");
        }

        // In the middle of a hand - make a decision
        if (findButton("Hit")) {
            const state = getGameState();
            const canDouble = findButton("Double") !== null;

            const action = getAction(
                state.player.total,
                state.dealerUpcard,
                state.player.isSoft,
                canDouble
            );

            ns.print(`Player: ${state.player.total}${state.player.isSoft ? " (soft)" : ""} vs Dealer: ${state.dealerUpcard} -> ${action.toUpperCase()}`);

            if (action === "double" && canDouble) {
                clickButton("Double");
            } else if (action === "stand") {
                clickButton("Stand");
            } else {
                clickButton("Hit");
            }

            await ns.sleep(DELAY_MS);
        }
    }

    // Final stats
    ns.print("=== SESSION COMPLETE ===");
    ns.print(`Hands played: ${handsPlayed}`);
    ns.print(`Wins: ${wins} | Losses: ${losses}`);
    ns.print(`Win rate: ${((wins / handsPlayed) * 100).toFixed(1)}%`);
}