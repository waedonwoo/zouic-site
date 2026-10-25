# The right order for board selection: scenario, constraints, then the board

> "Open Hardware Selection Handbook" · Geek Weidong @GeekWaedon
> Original: https://www.zouic.com/articles/handbook-ch1/

## 1.1 A familiar script

You want to build something — say a temperature and humidity meter you can check remotely. You open a shopping site, search for "development board", sort by sales and find a board with impressive specs: a few hundred MHz, dozens of GPIOs, and "free tutorials included". The price is reasonable. You order.

Three days later the board arrives. Then you discover the tutorials are five years old, the bundled IDE will not install, and searching the error message returns three ancient posts on an English forum. A week later, the board goes in a drawer.

## 1.2 Wrong order vs right order

The wrong order (the instinct of 90% of beginners): specs → price → order → then figure out what to build.

The right order: scenario → constraints → board.

Why does the order matter so much? Because a development board is not a fast-moving consumer good — it is an entry point into an ecosystem. You are not just buying a PCB; you are buying the tutorials, libraries, community and documented pitfalls behind it. The clock speed on a spec sheet does not determine project success — the ecosystem does.

## 1.3 Step one: describe the scenario

"I want to build a smart device" is not a scenario, it is a wish. A proper scenario description answers four questions:

| Question | Example (remote temperature/humidity meter) |
| --- | --- |
| What are you building? | Collect temperature and humidity and report to a page you can view on your phone |
| Who is it for? | Myself, at home |
| Where will it go? | Living room with a power outlet — but I also want to try the balcony |
| How long will it run? | Always on, ideally unattended for months |

Fill in this template and you have already eliminated more than half of the candidate boards.

## 1.4 Step two: three typical constraints

Constraints filter the candidate set from "dozens of boards" down to "two or three". In order of importance:

**Networking.** No connectivity (local control, offline operation) → every MCU board remains a candidate Wi-Fi/Bluetooth → narrows to boards with built-in wireless such as the Espressif ESP32 family, Pico W and Arduino Nano ESP32 Long-range low power (hundreds of metres or more) → LoRa solutions, usually "main board + LoRa module" New protocol (NearLink) → the NearLink series, but accept that the ecosystem is still young

Many selection mistakes come from applying this filter last: you buy a board without wireless, discover halfway through that you need connectivity, and have to start over with an add-on module.

**Real-time requirements.** Ask yourself: if the system responds 0.1 seconds late, could that cause an accident? Yes (motor control, closed-loop PID, balance bots) → you need hard real-time; choose a traditional MCU such as STM32 and stay away from any board running Linux No (temperature/humidity reporting, human-machine interaction, data logging) → far more options, including Linux boards

A one-line test: any delay the human eye tolerates is fine for an MCU; any delay a motor cannot tolerate is unacceptable for Linux.

**Ecosystem maturity.** This is the highest-weight factor for beginners and can be relaxed for experienced makers. Check three things: Are there plenty of tutorials in your language? (Search the board model — if you find fewer than 10 decent tutorials, beginners should stay away.) Is there an existing library for every peripheral you plan to use? (OLED, servo, sensors — check each one.) Can you find answers to error messages? (Search the board model plus a common error keyword and see what comes back.)

This is why beginners are advised to start with ESP32 or STM32 — not because they are the most powerful, but because every step where you get stuck, someone has been stuck before and written down the answer.

Secondary constraints (budget, power consumption) come after these three. The reason is simple: the difference between ¥30 and ¥60 matters far less than whether you can finish the project at all.

## 1.5 A complete walkthrough

Back to the remote temperature/humidity meter from the opening. Here is the full reasoning:

Scenario: home use, living room/balcony, always on → Networking: Wi-Fi required, so all boards without wireless are out → Real-time: people read the numbers, half a second is fine → Ecosystem: first project, needs tutorials, Espressif wins → Secondary: budget-sensitive picks ESP32-C3, adding a screen picks ESP32-S3 → Conclusion: ESP32-S3-DevKitC or ESP32-C3-DevKitM.

The whole walkthrough takes less than two minutes, but every step has a reason. It does not guarantee the most powerful board — it guarantees a board you can finish the project with.

## 1.6 Three thinking traps

**Spec worship.**  "This one runs at 240 MHz and that one only 133 MHz, so buy the faster one." — The compute your temperature meter needs was available on chips twenty years ago. Excess specs will not make you succeed; a barren ecosystem will definitely make you fail.

**Architecture romance.**  "RISC-V is the future, I want to learn it in one go." — There is nothing wrong with believing in the architecture, but starting your first project on a RISC-V Linux board means facing three unknowns at once: a new architecture, a new OS and a new project. Challenge one layer at a time.

**One-board-for-everything.**  "Buy a board that can do everything, then I am set for any future project." — There is no do-everything board. Boards with Wi-Fi are not great at hard real-time; boards running Linux are not power-efficient. Development boards are consumables, not heirlooms.

## 1.7 Chapter checklist

- Have I written the four-part scenario? (what / who / where / how long)
- Is the networking requirement clear?
- Have I judged the real-time requirement?
- Have I counted tutorials for the candidate boards?
- Does every peripheral I need have an existing library?
- Is budget considered last?
- Am I choosing for this project, not for every future project?

**Next chapter:** 2.1 Wi-Fi/IoT workhorses — ESP32-S3, ESP32-C3, ESP32-C6 and BL602 compared: same Wi-Fi, double the price, what does the extra money buy?

Companion cheatsheet: One-Page Cheatsheet: I Want to Build X — Which Board Should I Buy? The handbook is updated continuously; join the GeekWaedon Knowledge Planet for new chapters.
