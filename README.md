# Rocket Coder

Rocket Coder is a lightweight browser game prototype where you:

- Build a rocket in a VAB (Vehicle Assembly Building) using stackable parts.
- Program the rocket with script commands (`throttle`, `wait`, `pitch`, `stage`).
- Launch from Earth, Moon, or Mars with gravity based on Newton's law.

## Run

Open `index.html` in any modern browser.

## Gameplay loop

1. Go to **VAB** and create a rocket.
2. Go to **Programming** and write a launch script.
3. Go to **Launch**, choose a planet, and launch.

## Notes

- Gravity uses `F = G * M / r²`.
- Basic atmospheric drag is applied on planets with atmosphere.
- Staging removes the top-most part from the rocket stack.
