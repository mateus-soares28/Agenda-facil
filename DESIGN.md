---
name: Agenda Fácil
description: Gestão clara para a rotina do professor de padel.
colors:
  dark: "#111111"
  canvas: "#F7F7F7"
  surface: "#FFFFFF"
  ink: "#151515"
  muted: "#636363"
  border: "#E6E6E6"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: "400"
  heading:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontWeight: "600"
rounded:
  control: "7px"
  surface: "12px"
---

# Design System: Agenda Fácil

## Overview

A calm, practical work surface for a padel teacher checking the day between lessons. The app uses a black navigation rail, white content surfaces, and larger desktop typography. The rail can collapse to give the agenda more space.

## Colors

Black anchors navigation and primary actions. White surfaces and restrained gray borders support fast reading.

## Typography

Use the platform's familiar sans-serif system stack so the page builds without a runtime or build-time font download. Desktop body text starts at 16px, with larger numerals for operational counts.

## Components

Controls and content surfaces use 7–10px radii. Borders are subtle, with elevation reserved for sticky navigation and hover feedback. Icons are consistent stroke SVGs. Tables retain clear labels and row structure.

## Motion

Use short state transitions on interactive controls, visible keyboard focus, and reduced-motion support. Avoid page-load choreography.

## Responsive behavior

Desktop uses a collapsible navigation rail and full-width content. On phones, use bottom navigation and a slide-out menu for secondary areas. Student tables remain horizontally scrollable.

## Approved surface

The current dashboard shows live local counts, today's lessons, and registered students. Empty states replace all sample data. Its layout will remain data-driven when the Supabase repository is connected.
