import gulp from 'gulp';
const { series, watch, src, dest, parallel } = gulp;
import pump from 'pump';
import path from 'path';
import releaseUtils from '@tryghost/release-utils';
import inquirer from 'inquirer';

// gulp plugins and utils
import livereload from 'gulp-livereload';
import postcss from 'gulp-postcss';
import GulpZip from 'gulp-zip';
import concat from 'gulp-concat';
import uglify from 'gulp-uglify';
import beeper from 'beeper';
import fs from 'fs';
import * as sass from 'sass';
import gulpSass from 'gulp-sass';
const sassCompiler = gulpSass(sass);

// postcss plugins
import autoprefixer from 'autoprefixer';
import colorFunction from 'postcss-color-mod-function';
import cssnano from 'cssnano';
import easyimport from 'postcss-easy-import';
import tailwindcss from 'tailwindcss';
import tailwindConfig from './tailwind.config.js';


// Jangan lupa diganti
const REPO = 'TryGhost/Casper';
const REPO_READONLY = 'TryGhost/Casper';
const CHANGELOG_PATH = path.join(process.cwd(), '.', 'changelog.md');


function serve(done) {
    livereload.listen();
    done();
}

const handleError = (done) => {
    return function (err) {
        if (err) {
            beeper();
        }
        return done(err);
    };
};

function hbs(done) {
    pump([
        src(['*.hbs', 'partials/**/*.hbs']),
        livereload()
    ], handleError(done));
}

function css(done) {
    pump([
        src('assets/css/**/*.scss', { sourcemaps: true }),
        sassCompiler().on('error', sassCompiler.logError),
        postcss([
            easyimport,
            tailwindcss(tailwindConfig),
            colorFunction(),
            autoprefixer(),
            cssnano()
        ]),
        dest('assets/built/', { sourcemaps: '.' }),
        livereload()
    ], handleError(done));
}

function js(done) {
    pump([
        src([
            // pull in lib files first so our own code can depend on it
            'assets/js/lib/*.js',
            'assets/js/*.js'
        ], { sourcemaps: true }),
        concat('casper.js'),
        uglify(),
        dest('assets/built/', { sourcemaps: '.' }),
        livereload(),
    ], handleError(done));
}

function zipper(done) {
    const filename = JSON.parse(fs.readFileSync('./package.json')).name + '.zip';

    pump([
        src([
            '**',
            '!node_modules', '!node_modules/**',
            '!dist', '!dist/**',
            '!yarn-error.log',
            '!yarn.lock',
            '!gulpfile.js'
        ]),
        GulpZip(filename),
        dest('dist/')
    ], handleError(done));
}

const cssWatcher = () => watch('assets/css/**', css);
const jsWatcher = () => watch('assets/js/**', js);
const hbsWatcher = () => watch(['*.hbs', 'partials/**/*.hbs'], hbs);
const watcher = parallel(cssWatcher, jsWatcher, hbsWatcher);

export const build = series(css, js);
export const zip = series(build, zipper);
export default series(build, serve, watcher);

export const release = async () => {
    let packageJSON = JSON.parse(fs.readFileSync('./package.json'));
    const newVersion = packageJSON.version;

    if (!newVersion || newVersion === '') {
        console.log(`Invalid version: ${newVersion}`);
        return;
    }

    console.log(`\nCreating release for ${newVersion}...`);

    const githubToken = process.env.GST_TOKEN;

    if (!githubToken) {
        console.log('Please configure your environment with a GitHub token located in GST_TOKEN');
        return;
    }

    try {
        const result = await inquirer.prompt([{
            type: 'input',
            name: 'compatibleWithGhost',
            message: 'Which version of Ghost is it compatible with?',
            default: '5.0.0'
        }]);

        const compatibleWithGhost = result.compatibleWithGhost;

        const releasesResponse = await releaseUtils.releases.get({
            userAgent: 'Casper',
            uri: `https://api.github.com/repos/${REPO_READONLY}/releases`
        });

        if (!releasesResponse || !releasesResponse) {
            console.log('No releases found. Skipping...');
            return;
        }

        let previousVersion = releasesResponse[0].tag_name || releasesResponse[0].name;
        console.log(`Previous version: ${previousVersion}`);

        const changelog = new releaseUtils.Changelog({
            changelogPath: CHANGELOG_PATH,
            folder: path.join(process.cwd(), '.')
        });

        changelog
            .write({
                githubRepoPath: `https://github.com/${REPO}`,
                lastVersion: previousVersion
            })
            .sort()
            .clean();

        const newReleaseResponse = await releaseUtils.releases.create({
            draft: true,
            preRelease: false,
            tagName: 'v' + newVersion,
            releaseName: newVersion,
            userAgent: 'Casper',
            uri: `https://api.github.com/repos/${REPO}/releases`,
            github: {
                token: githubToken
            },
            content: [`**Compatible with Ghost ≥ ${compatibleWithGhost}**\n\n`],
            changelogPath: CHANGELOG_PATH
        });
        console.log(`\nRelease draft generated: ${newReleaseResponse.releaseUrl}\n`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};
