# One-page cheat sheet: I want to build X — which board should I buy?

> Appendix to the Open Hardware Selection Handbook · GeekWaedon
> Original: https://www.zouic.com/articles/board-selection-cheatsheet
> Price bands: ¥ = under ~CNY 30, ¥¥ = CNY 30-100, ¥¥¥ = above CNY 100

## Decision tree (locate in 30 seconds)
```text
First question: does the project need networking?
├─ Wi-Fi/Bluetooth ──→ Scenario 1
└─ Local control only ──→ Second question: battery-powered long-term?
    ├─ Yes, runtime-sensitive ──→ Scenario 3
    └─ Not sensitive / mains powered ──→ Scenarios 2 / 4 / 5
```

## Scenario cheatsheet (12 common cases)
| What you want to do | First choice | Alternative | Why | Pitfall |
| --- | --- | --- | --- | --- |
| First IoT project (sensor reporting, remote switches) | ESP32-S3-DevKitC ¥¥ | ESP32-C3 ¥ | Most complete Espressif ecosystem, tutorials everywhere, Wi-Fi and Bluetooth built in | Buy the official DevKit; no-name boards have confusing pin labels |
| Learn embedded fundamentals (GPIO, interrupts, timers) | STM32F103C8T6 ¥ | Arduino UNO R4 ¥¥ | Register-level work teaches the fundamentals; most mature tutorial ecosystem | Needs a separate ST-Link programmer; watch out for clone chips |
| Battery-powered low power (sensor nodes, portables) | Raspberry Pi Pico ¥ | ESP32-C3 ¥ | RP2040 power control is simple and direct; dual cores are plenty | Pico has no Wi-Fi — choose Pico W (¥¥) if you need connectivity |
| Fast validation with the Arduino ecosystem | Arduino UNO R4 Minima ¥¥ | Nano ESP32 ¥¥ | Unbeatable library ecosystem; everything connects | UNO R4 switched to a Renesas chip; check library support before ordering |
| Edge AI inference (faces, object detection) | Sipeed Maixduino ¥¥ | — | The K210 has a built-in NPU, so inference does not depend on the cloud | Compute is limited — good for learning and lightweight deployment |
| Motor control / PID (balance bots, gimbals) | STM32F103C8T6 ¥ | STM32F407 ¥¥ | Rich timers, good real-time behaviour, plenty of FOC tutorials | Get open-loop control working before closing the loop |
| Industrial / CAN bus (automotive, data acquisition) | STM32F407ZGT6 ¥¥ | — | Native CAN controller | A CAN transceiver (e.g. TJA1050) still has to be added |
| Learn RISC-V (instruction set, architecture) | CH32V307 ¥ | GD32VF103 ¥ | Cheap and domestic; enough to learn the architecture properly | For a Linux-class RISC-V experience, see the next row |
| RISC-V + Linux (run a real OS) | VisionFive 2 ¥¥¥ | HiFive Unmatched ¥¥¥ | Runs a full Linux distribution, close to PC-style development | Not cheap — only for people who clearly need RISC-V Linux |
| Voice interaction (offline voice control) | ESP32-S3-DevKitC ¥¥ | — | Espressif's ESP-SR solution works out of the box | Offline vocabularies are limited; complex intent needs the cloud |
| Try a new protocol (NearLink) | NearLink DevKit Pro ¥¥ | Sensor Node ¥¥ | NearLink is early — joining now is a content opportunity | Few resources; suitable for experienced makers, not beginners |
| LoRa long-range communication (hundreds of metres to km) | ESP32-S3 + LoRa module ¥¥ | — | Add an SX1276 module to a Scenario 1 board — no need to change boards | Check local ISM band rules (470 MHz in China) |

## Three questions before ordering
1. Are there enough tutorials in your language? (Fewer than 10 decent ones means beginners should stay away.)
2. Do you need a separate programmer? (STM32 does; ESP32/Pico do not.)
3. Is the chip powerful enough for your project? (Work out compute needs first for camera or face-recognition work.)

## Reverse checklist (what you learn only after buying)
- Buy STM32 and you discover the programmer, jumper wires and breadboard are all extra — entry cost doubles.
- Buy a RISC-V Linux board and you discover ESP32 would have done the job, at a tenth of the price.
- Buy Pico and you discover networking needs an add-on module — you should have bought Pico W.
- Buy a no-name ESP32 and you discover the USB-serial chip is cut-rate and Windows drivers will not install.

## How this cheatsheet relates to the handbook
This page is the condensed version of the Open Hardware Selection Handbook. The full handbook covers pitfalls per board, eight complete project walkthroughs, toolchain checklists and how to identify genuine parts.
Chapter 1 is free to read: "The Right Order of Selection". Join the GeekWaedon Knowledge Planet for handbook updates and hands-on notes.
