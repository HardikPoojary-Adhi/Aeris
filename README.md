# AERIS

## Smart Air Quality Intelligence & Monitoring System

AERIS is an IoT-based environmental monitoring platform designed to continuously collect, process, transmit, and visualize air-quality and environmental data in real time.

Built around an ESP32 and a network of environmental sensors, AERIS connects physical sensing hardware to a cloud-backed monitoring dashboard, creating a foundation for scalable and intelligent environmental monitoring.

> **Measure the air. Understand the environment. Act on the data.**

---

## Overview

Air quality can vary significantly between locations, buildings, and time periods.

Traditional monitoring infrastructure can be expensive and difficult to deploy at high density. AERIS explores a more accessible approach by combining low-cost sensors, embedded computing, wireless connectivity, cloud infrastructure, and real-time visualization.

The system collects environmental measurements from sensors connected to an ESP32, processes the readings, and synchronizes the data with a cloud backend.

The resulting information can then be viewed through the AERIS dashboard.

```text
┌───────────────────────┐
│     ENVIRONMENT       │
│                       │
│  Temperature          │
│  Humidity             │
│  Particulate Matter   │
│  Gas Concentrations   │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│         ESP32         │
│                       │
│  Sensor Acquisition   │
│  Data Processing      │
│  Wi-Fi Connectivity   │
└───────────┬───────────┘
            │
            │ Wi-Fi
            ▼
┌───────────────────────┐
│    CLOUD BACKEND      │
│                       │
│       Firebase        │
│  Authentication       │
│  Data Storage         │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│    AERIS DASHBOARD    │
│                       │
│  Live Measurements    │
│  Device Status        │
│  Data Visualization   │
│  Historical Trends    │
└───────────────────────┘