# 一页纸速查表：我要做 XX，该买哪块开发板

> 《开源硬件实战选型手册》附录 · 极客微栋 @GeekWaedon
> Original: https://www.zouic.com/articles/board-selection-cheatsheet/
> 价格带约定：¥ = 约 30 元内，¥¥ = 30-100 元，¥¥¥ = 百元以上

## 决策树（30 秒定位）
```text
你的第一个问题：项目要不要联网？
├─ 要 WiFi/蓝牙联网 ──→ 场景 1
└─ 纯本地控制/学习 ──→ 第二个问题：要不要电池供电长期跑？
    ├─ 要，且对续航敏感 ──→ 场景 3
    └─ 不敏感/插电 ──→ 场景 2 / 4 / 5
```

## 场景速查（12 个高频场景）
| 你要做的事 | 首选 | 备选 | 为什么是它 | 避坑提示 |
| --- | --- | --- | --- | --- |
| Erstes IoT-Projekt (Temperatur-/Feuchtigkeitsmeldung, ferngesteuerte Schalter) | ESP32-S3-DevKitC ¥¥ | ESP32-C3 ¥ | Vollständigstes Espressif-Ökosystem, Tutorials überall, WLAN und Bluetooth integriert | Offizielles DevKit kaufen; No-Name-Minimalboards haben verwirrende Pin-Beschriftungen |
| Embedded-Grundlagen lernen (GPIO, Interrupts, Timer) | STM32F103C8T6 ¥ | Arduino UNO R4 ¥¥ | Arbeit auf Registerebene vermittelt die Grundlagen; ausgereifteste Tutorial-Landschaft | Separater ST-Link-Programmer nötig; auf Klon-Chips achten |
| Batteriebetrieb / Low Power (Sensorknoten, mobile Geräte) | Raspberry Pi Pico ¥ | ESP32-C3 ¥ | RP2040-Power-Management ist einfach und direkt; zwei Kerne reichen | Pico hat kein WLAN – für Konnektivität Pico W (¥¥) wählen |
| Schnelle Validierung im Arduino-Ökosystem (fertige Modulbibliotheken) | Arduino UNO R4 Minima ¥¥ | Nano ESP32 ¥¥ | Unschlagbare Bibliotheksvielfalt; alles lässt sich anbinden | UNO R4 nutzt einen Renesas-Chip; vor der Bestellung Bibliotheksunterstützung prüfen |
| Edge-AI-Inferenz (Gesichter, Objekterkennung) | Sipeed Maixduino ¥¥ | — | Der K210 hat eine eingebaute NPU, Inferenz braucht keine Cloud | Rechenleistung begrenzt – gut für Lernen und leichte Einsätze, nicht für komplexe Modelle |
| Motorsteuerung / PID (Balance-Roboter, Gimbal) | STM32F103C8T6 ¥ | STM32F407 ¥¥ | Viele Timer, gutes Echtzeitverhalten, reichlich FOC-Tutorials | Zuerst den offenen Regelkreis zum Laufen bringen, dann schließen |
| Industrie / CAN-Bus (Automotive, industrielle Datenerfassung) | STM32F407ZGT6 ¥¥ | — | Nativer CAN-Controller | Ein CAN-Transceiver (z. B. TJA1050) muss zusätzlich beschafft werden |
| RISC-V lernen (Befehlssatz, Architektur) | CH32V307 ¥ | GD32VF103 ¥ | Günstig und aus China; reicht aus, um die Architektur solide zu lernen | Für RISC-V auf Linux-Niveau siehe nächste Zeile |
| RISC-V + Linux (echtes Betriebssystem) | VisionFive 2 ¥¥¥ | HiFive Unmatched ¥¥¥ | Läuft mit vollständiger Linux-Distribution, nah an der PC-Entwicklung | Nicht günstig – nur bei klarem Bedarf an einer RISC-V-Linux-Umgebung |
| Sprachsteuerung (Offline-Sprachbefehle) | ESP32-S3-DevKitC ¥¥ | — | Espressifs ESP-SR funktioniert ohne Weiteres | Offline-Vokabular begrenzt; komplexe Absichten brauchen eine Cloud-Lösung |
| Neues Protokoll ausprobieren (NearLink) | NearLink DevKit Pro ¥¥ | Sensor Node ¥¥ | NearLink ist noch jung – der Einstieg ist jetzt eine Content-Chance | Wenig Material und ein junges Ökosystem; eher für erfahrene Maker als für Einsteiger |
| LoRa-Funk (hunderte Meter bis mehrere Kilometer) | ESP32-S3 + LoRa-Modul ¥¥ | — | Ein SX1276-Modul zum Board aus Zeile 1 genügt – kein Boardwechsel nötig | ISM-Bandregeln des eigenen Landes beachten (in China 470 MHz) |

## 新手三问（下单前自检）
1. 这块板的中文教程多不多？（搜一下，像样教程少于 10 篇的板子，新手别碰）
2. 烧录要不要额外买下载器？（STM32 需要，ESP32/Pico 不需要）
3. 我要做的项目，芯片算力够不够？（涉及摄像头/人脸识别的，先想清楚算力）

## 反选表（买了这些板才知道的事）
- 买了 STM32 才发现：调试下载器、杜邦线、面包板都要另算，入门总成本翻倍
- 买了 RISC-V Linux 板才发现：你想做的项目其实 ESP32 就够，为架构情怀多花了十倍的钱
- 买了 Pico 才发现：要联网的时候还得外挂模块，一开始就该买 Pico W
- 买了杂牌 ESP32 才发现：串口芯片偷工减料，Windows 驱动都装不上——官方 DevKit 多花十几块买的是省心

## 本表与手册的关系
这张表是《开源硬件实战选型手册》的浓缩版。手册完整版包含：每块板的避坑点详解、8 个实战项目的完整拆解、工具链配置清单、采购正品识别方法。
第一章已开放免费试读：《选型的正确顺序》。想第一时间获取手册更新和实战笔记，欢迎加入知识星球「极客微栋」。
