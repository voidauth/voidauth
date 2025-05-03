import { SchematicTestRunner } from '@angular-devkit/schematics/testing/index.js'
import * as fs from 'node:fs'
import * as path from 'path'
import appConfig from './config.ts'
import * as sass from 'sass'

export async function generateTheme() {
  const schematicRunner = new SchematicTestRunner(
    'schematics',
    './node_modules/@angular/material/schematics/collection.json',
  )

  const options = {
    primaryColor: appConfig.PRIMARY_COLOR,
    directory: './',
  }

  try {
    const result = await schematicRunner.runSchematic('m3Theme', options)
    const resultFile = result.files[0]
    if (!resultFile) {
      throw new Error('Generated theme content not found in result.')
    }
    const themeContent = result.readContent(resultFile)
    if (themeContent) {
      fs.mkdirSync('./theme', {
        recursive: true,
      })
      fs.writeFileSync(path.join('./theme', resultFile), themeContent)
    }

    const compiled = sass.compile(path.join('./theme', 'theme-styles.scss'), {
      loadPaths: [
        './theme',
        './node_modules',
      ],
    })

    // TODO: get primary contrast color for use in config

    fs.writeFileSync(path.join('./theme', 'generated-mat-theme.css'), compiled.css)
  } catch (error) {
    console.error(error)
  }
}
