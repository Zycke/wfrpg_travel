# WFRP4e Travel System Module

A comprehensive travel and journey management system for Warhammer Fantasy Roleplay 4th Edition in Foundry VTT.

## Features

- **Party Management**: Track multiple characters as a single party unit
- **Resource Tracking**: Provisions, weariness, travel fatigue, hunger, and exposure
- **Journey Planning**: Calculate journey difficulty and danger ratings
- **Travel Actions**: Integrated skill checks for foraging, pathfinding, scouting, and more
- **Camp Actions**: Setup camp, cook, hunt, and other camp activities
- **Weather System**: Track temperature, precipitation, visibility, and wind effects
- **Event System**: Random events that affect party resources and status

## Installation

### Manual Installation

1. Copy the entire `travel-system` folder into your Foundry VTT `Data/modules/` directory
2. The path should be: `Data/modules/wfrp4e-travel-system/`
3. Restart Foundry VTT
4. Enable the module in your world's Module Management screen

### Folder Structure

```
wfrp4e-travel-system/
├── module.json
├── README.md
├── scripts/
│   ├── travel-system.js
│   └── party-sheet.js
├── templates/
│   └── party-sheet.html
├── styles/
│   └── party-sheet.css
└── lang/
    └── en.json
```

## Usage

### Creating a Party

1. Open the Actors Directory
2. Click "Create Actor"
3. Enter a name for your party (e.g., "The Adventurers")
4. Select "Character" as the type
5. Click "Create"
6. Right-click on the newly created actor and select "Sheet"
7. Choose "Travel Party Sheet" from the list
8. The actor will automatically be initialized as a party the first time you open the Travel Party Sheet

### Adding Characters to the Party

1. Open the Party sheet
2. Drag and drop character actors from the Actors Directory onto the party sheet
3. Characters will appear in the "Party Members" section
4. The Weariness Threshold is automatically calculated from party members' Toughness Bonuses

### Tracking Resources

- Use the **+** and **-** buttons to adjust resources like Weariness, Provisions, Journey Pool, etc.
- The Overview tab shows all critical information at a glance
- Status indicators will turn red when thresholds are reached

### Travel Modes

Toggle travel options in the Travel Mode section:
- **Forced March**: Move faster but gain weariness
- **Extra Rations**: Bonus to skill checks, ignore first weariness rank
- **Half Rations**: Conserve provisions but minimum 2 hunger ranks
- **Has Mounts**: Increases weariness threshold
- **Mounts Grazing**: Mounts consume no provisions (when possible)

## Current Implementation Status

### ✅ Completed (Phase 1-3)

- Module initialization and setup
- Party actor creation
- Character linking via drag-and-drop
- Overview tab with all critical status information
- Automatic weariness threshold calculation
- Resource tracking controls
- Weather summary display
- Travel mode toggles

### 🚧 In Progress

- Journey tab (planning and tracking)
- Resources tab (detailed consumables)
- Travel Actions tab (skill check integration)
- Camp Actions tab (skill check integration)
- Weather & Events tab (full details and GM controls)

## Testing Checklist

1. **Module Activation**
   - [ ] Module appears in Module Management
   - [ ] Module activates without errors
   - [ ] Console shows initialization messages

2. **Party Creation**
   - [ ] Create a Character actor
   - [ ] Can change sheet to "Travel Party Sheet"
   - [ ] Opening the Travel Party Sheet initializes party data
   - [ ] Notification appears confirming party initialization

3. **Character Linking**
   - [ ] Can drag character actors onto party sheet
   - [ ] Characters appear in party members list
   - [ ] Character portraits and names display correctly
   - [ ] Toughness Bonus shows for each character
   - [ ] Weariness Threshold calculates correctly
   - [ ] Remove button works

4. **Resource Controls**
   - [ ] +/- buttons increment/decrement values
   - [ ] Values don't go below 0
   - [ ] Journey Pool current/max displays correctly
   - [ ] Provisions show with "days" label

5. **Status Warnings**
   - [ ] Weariness turns red when >= threshold
   - [ ] Travel Fatigue shows effects when > 0
   - [ ] Hunger and Exposure highlight when > 0

6. **Travel Options**
   - [ ] Checkboxes toggle correctly
   - [ ] Mounts Grazing only shows when Has Mounts is checked
   - [ ] Options persist after closing/reopening sheet

7. **Weather Display**
   - [ ] Temperature and precipitation display
   - [ ] Weather warnings appear for extreme temperatures
   - [ ] Weather values use localization

## Known Issues

- None currently (Phase 1-3 implementation)

## Development Roadmap

### Phase 4: Core Functionality
- Journey planning tools
- Detailed resource management
- Automatic weariness → fatigue conversion
- Provision consumption tracking

### Phase 5: Action System
- Travel action buttons with character selection
- Camp action buttons with character selection
- Integration with WFRP4e skill test system
- Result processing and resource updates

### Phase 6: Weather & Events
- Full weather tracking interface
- Event effect quick-apply buttons
- GM-only controls
- Random event rolling

## Support

For issues, suggestions, or questions, please contact the module author.

## License

[Add license information]

## Credits

- System design based on custom travel rules
- Built for WFRP4e system in Foundry VTT
