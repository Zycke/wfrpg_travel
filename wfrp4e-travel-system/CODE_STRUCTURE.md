# WFRP4e Travel System - Code Structure

## Overview
This document describes the structure and organization of the WFRP4e Travel System module code.

## File Structure

```
wfrp4e-travel-system/
├── module.json                     # Module manifest
├── README.md                       # User documentation
├── CODE_STRUCTURE.md              # This file
├── scripts/
│   ├── travel-system.js           # Module initialization
│   └── party-sheet.js             # Main party sheet class (1186 lines)
├── templates/
│   └── party-sheet.html           # Handlebars template
├── styles/
│   └── party-sheet.css            # Styling (1865 lines)
└── lang/
    └── en.json                    # Localization strings
```

## Party Sheet Class Structure (party-sheet.js)

The `PartySheet` class extends Foundry's `ActorSheet` and is organized into 7 logical sections:

### Section 1: Class Configuration (Lines 1-40)
- `defaultOptions()` - Sheet configuration
- `get template()` - Template path

### Section 2: Data Management (Lines 41-340)
- `getData()` - Main data preparation method
- `_initializePartyData()` - Initialize default flags
- `_initializeCampData()` - Setup camp/watch data
- `_initializeWeatherData()` - Setup weather data  
- `_buildWeatherEffects()` - Build active effects list
- `_initializeEventsData()` - Setup events data
- `_render()` - Post-render hook

### Section 3: Helper & Calculation Methods (Lines 341-430)
- `_getLinkedCharacters()` - Fetch character data
- `_calculateWearinessThreshold()` - Calculate TB-based threshold
- `_addWeariness()` - Add weariness with overflow handling
- `_formatCurrency()` - Format brass/silver/gold display
- `_capitalizeWeather()` - Capitalize weather strings

### Section 4: Event Handlers (Lines 431-805)
- `activateListeners()` - Register all click/change handlers
- `_onDrop()` - Handle actor drops
- `_onRemoveCharacter()` - Remove character from party
- `_onResourceControl()` - +/- resource buttons
- `_adjustPreparednessForConsumable()` - Handle consumable costs
- `_onTravelOptionToggle()` - Toggle travel options
- `_onPhaseControl()` - Change journey phase
- `_onPhaseCycle()` - Cycle phases with mouse wheel
- `_onDangerFactorChange()` - Update danger rating
- `_onStatusToggle()` - Toggle traveling/camping
- `_onRollHexesUntilEvent()` - Roll d6 for event trigger
- `_onActionRoll()` - Handle action button clicks
- `_onResetConsumables()` - Reset consumables & refund PP
- `_onWatchToggle()` - Toggle watch status
- `_onTaskActionChange()` - Change task action
- `_onModifierChange()` - Event modifier +/-
- `_onRollEvent()` - Roll d100 event

### Section 5: Weather System (Lines 806-1045)
- `_generateWeather()` - Roll all weather aspects
- `_getTemperature()` - Temperature lookup table
- `_getPrecipitation()` - Precipitation lookup table
- `_getVisibility()` - Visibility lookup table
- `_getWind()` - Wind lookup table
- `_checkExtremeWeather()` - Detect extreme conditions
- `_calculateExposure()` - Calculate daily exposure
- `_onWeatherConditionChange()` - Update climate/season/terrain
- `_onWeatherOverride()` - Manual weather override
- `_onWeatherGearChange()` - Toggle weather gear

### Section 6: Event System (Lines 1046-1110)
- `_getEventTable()` - Return event table data (12 events)

### Section 7: Daily Processing (Lines 1111-1186)
- `_onDaysOnRoadIncrease()` - Process all daily effects:
  1. Consume provisions (1 or 2x)
  2. Consume mount provisions (if needed)
  3. Hunger recovery check
  4. Exposure gain/reset
  5. Blizzard JP cost
  6. Thunder Storm weariness
  7. Daily weariness calculation
  8. Weariness overflow to Travel Fatigue
  9. Exposure wound damage
  10. Increase Days on Road counter

## Key Design Patterns

### 1. Flag-Based Storage
All party data stored in actor flags under `wfrp4e-travel-system` namespace:
```javascript
this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions')
this.actor.setFlag('wfrp4e-travel-system', 'journey.phase', 'traveling')
```

### 2. Overflow System
Weariness automatically converts to Travel Fatigue when exceeding threshold:
```javascript
const result = await this._addWeariness(amount);
// Handles threshold calculation and fatigue conversion automatically
```

### 3. Precedence Rules
Weather conditions follow strict precedence:
1. Thunder Storm + Extreme Cold → Blizzard
2. Blizzard overrides all
3. Extreme Cold overrides Thunder Storm
4. Thunder Storm standalone

### 4. Modular Initialization
Each data type (camp, weather, events) has its own initialization method called from `getData()`.

## Data Structure

### Actor Flags Schema
```javascript
{
  isPartyActor: true,
  linkedCharacters: ['actor-id-1', 'actor-id-2'],
  journey: {
    destination: '',
    hexesRemaining: 0,
    hexesUntilEvent: 0,
    daysOnRoad: 0,
    dangerRating: 0,
    phase: 'preparation|traveling|camping',
    dangerFactors: { /* 4 boolean flags */ }
  },
  resources: {
    provisions: 0,
    campSupplies: 0,
    mountProvisions: 0,
    hunger: 0,
    exposure: 0,
    weariness: 0,
    travelFatigue: 0,
    journeyPool: { current: 10, max: 10 },
    preparedness: 0,
    consumables: { /* 3 types */ }
  },
  travel: {
    status: 'camping|traveling',
    hasMounts: false,
    mountsGrazing: false
  },
  camp: {
    tasks: { 
      'character-id': { 
        keepingWatch: boolean, 
        selectedAction: string 
      } 
    }
  },
  weather: {
    conditions: { climate, season, terrain },
    current: { temperature, precipitation, visibility, wind },
    gear: { weatherAppropriateGear, campSetup }
  },
  events: {
    modifier: 0,
    lastRoll: { base, modifier, total }
  }
}
```

## Template Organization (party-sheet.html)

1. **Header** - Party name, image
2. **Navigation Tabs** - 7 tabs
3. **Overview Tab** - Journey summary, critical status, party members, weather
4. **Journey (Preparation) Tab** - Destination, hexes, danger, resources
5. **Resources Tab** - Provisions, consumables, costs
6. **Travel Actions Tab** - Journey pool, actions, tasks
7. **Camp Actions Tab** - Watch panel, camp tasks
8. **Weather & Terrain Tab** - Weather generation, conditions, effects, gear
9. **Events Tab** - Event roller, watch status, event table

## CSS Organization (party-sheet.css)

24 sections organized by feature:
1. Base & Layout
2. Header
3. Tabs
4. Overview Tab
5. Journey Tab
6. Resources Tab
7. Consumables
8. Travel Actions Tab
9. Camp Actions Tab
10-24. Various subsections (watch panel, weather, events, etc.)

## Performance Considerations

- Event handlers bound in `activateListeners()` - only when editable
- `setTimeout()` used for render delays to prevent race conditions
- Character data fetched once in `getData()`, not repeatedly
- Flag operations grouped to minimize updates

## Future Refactoring Opportunities

1. Extract weather system to separate class
2. Extract event system to separate class
3. Create utility module for common calculations
4. Consolidate duplicate CSS selectors
5. Add JSDoc comments for all methods
6. Create unit tests for calculation methods

## Version History

- **0.8.0** - Major code cleanup (44% reduction: 2117→1186 lines)
- **0.7.x** - Events system & Thunder Storm
- **0.6.x** - Weather system integration
- **0.5.x** - Currency conversion & daily processing
- **0.4.x** - Camping tab & watch system
- **0.3.x** - Travel actions integration
- **0.2.x** - Resources tab
- **0.1.x** - Initial foundation
