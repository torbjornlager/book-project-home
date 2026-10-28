#!/usr/bin/env python3
"""Build or verify the static Trinity Studio deployment; never fetches or publishes."""
from package_genealogist import main

if __name__ == '__main__':
    main(kind='studio')
