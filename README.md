# appl.emu

This is a simple Apple 1 emulator built with HTML, CSS, and JavaScript that runs directly in your web browser. It aims to modernize the experience of using one of the first personal computers, complete with Steve Wozniak's original Monitor ROM (Wozmon).

## Features

*   **Accurate 6502 Emulation**: The emulator includes a fairly complete 6502 CPU instruction set, allowing it to run original Apple 1 software.
*   **Wozmon ROM Included**: Comes pre-loaded with the 256-byte Wozmon, the Apple 1's system monitor.
*   **Retro CRT Effect**: The display is styled to look like a vintage CRT monitor, with scan lines and a flicker effect.
*   **Modern Conveniences**: Includes quality-of-life improvements over the original hardware, such as a working backspace key and "READY" instead of "\" as the boot message for Wozmon prompt.
*   **No Dependencies**: Pure HTML, CSS, and JavaScript. No build step or external libraries required.

## How to Use

1. Download the latest [release.](https://github.com/sammylord/appl.emu/releases)
2. Extract and open "index.html".
3. The emulator will start, and you will be greeted with the Wozmon prompt (except it says READY).

## How to Use (for testers)

1. Clone this repo and open "index.html" OR go [here.](https://sammylord.github.io/appl.emu)
2. The emulator will start, and you will be greeted with the Wozmon prompt (except it says READY).

## How to Use (for developers)

1, Fork this repository.
2. Clone that fork.
3. Start developing!


### Testing with a "Hello World" Program

You can enter and run programs directly from the Wozmon prompt. Here is a simple "Hello World" program to test the emulator.

**1. Enter the data and program:**

Type the following lines and press `Enter` after each one. This will store the string "HELLO WORLD" at address `$0300` and the program to print it at `$0280`.

```
0300: 48 45 4C 4C 4F 20 57 4F 52 4C 44 8D 00
```
```
0280: A2 00 BD 00 03 F0 04 20 EF FF E8 4C 82 02 4C 1F FF
```

**2. Run the program:**

Type the following command and press `Enter`:

```
0280R
```

The emulator will display `HELLO WORLD` and return to the prompt.

### Original Apple 1 Monitor Test

To test the monitor in a more classic fashion, you can enter the following program, which prints the character set in a loop.

Enter the following bytes into the monitor:
```
0: A9 0 AA 20 EF FF E8 8A 4C 2 0
```

Then, run the program by typing:
```
R
```

## File Structure

*   `index.html`: The main HTML file that sets up the structure of the emulator display.
*   `style.css`: Contains the styles for the retro CRT look and feel.
*   `main.js`: The core of the emulator. It includes the 6502 CPU emulation, memory management, I/O handling, convenience features, and the Wozmon ROM data. 
