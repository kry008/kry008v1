const fs = require('fs');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 40048;
const baseUrl = 'https://kry008.xyz';

app.use("/css", express.static(path.join(__dirname, 'css')));
app.use("/js", express.static(path.join(__dirname, 'js')));
app.use("/images", express.static(path.join(__dirname, 'images')));
app.use("/public", express.static(path.join(__dirname, 'public')));

app.all('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'html/index.html'));
});

app.all('/blog', (req, res) => {
    res.sendFile(path.join(__dirname, 'html/blog.html'));
});

const getConfigValue = (config, key, lang) => {
    if (key === 'description') {
        return config[`description-${lang}`] || config[`decription-${lang}`] || '';
    }
    return config[`${key}-${lang}`] || '';
};

const replacePlaceholders = (template, values) => {
    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => values[key] ?? '');
};

const getReadingTime = (html) => {
    const text = html.replace(/<[^>]*>?/gm, ''); // usuń znaczniki HTML
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / 200);
    return minutes;
};


app.get('/blog/:lang', (req, res) => {
    const lang = req.params.lang;
    const blogRoot = path.join(__dirname, 'blog');

    try {
        const folders = fs.readdirSync(blogRoot).filter(f => fs.lstatSync(path.join(blogRoot, f)).isDirectory());

        // Wczytaj i posortuj artykuły po dacie malejąco
        const articles = folders
            .map(folder => {
                const folderPath = path.join(blogRoot, folder);
                const configPath = path.join(folderPath, 'config.json');
                const htmlPath = path.join(folderPath, `${lang}.html`);
                if (!fs.existsSync(configPath) || !fs.existsSync(htmlPath)) return null;

                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                if (config.visible === false) return null;

                return {
                    folder,
                    date: new Date(config.date || '1970-01-01'),
                    config
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.date - a.date);

        let listHtml = '';
        for (const { folder, config } of articles) {
            const title = getConfigValue(config, 'title', lang);
            const subtitle = getConfigValue(config, 'subtitle', lang);
            const coverImage = getConfigValue(config, 'cover_image', lang) || '/images/logo.webp';
            const date = config.date || (lang === 'pl' ? 'Brak podanej' : 'Not provided');
            const author = config.author || 'kry008';

            const htmlPath = path.join(blogRoot, folder, `${lang}.html`);
            const articleHtml = fs.readFileSync(htmlPath, 'utf-8');
            const readingTime = getReadingTime(articleHtml);

            listHtml += `
                <div class="blog-entry">
                    <div class="cover-image">
                        <img src="${coverImage}" alt="${title}">
                    </div>
                    <div class="blog-content">
                        <h2><a href="/blog/${lang}/${folder}">${title}</a></h2>
                        <p>${subtitle}</p>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <p class="author">${lang === 'pl' ? 'Autor' : 'Author'}: ${author}</p>
                            <p class="date">${lang === 'pl' ? 'Data' : 'Date'}: ${date}</p>
                            <p class="reading-time">${lang === 'pl' ? 'Czas czytania' : 'Reading time'}: ${readingTime} min</p>
                        </div>
                        <p><a href="/blog/${lang}/${folder}">${lang === 'pl' ? 'Czytaj więcej' : 'Read more'}</a></p>
                    </div>
                </div>
            `;
        }


        const template = fs.readFileSync(path.join(blogRoot, 'blog.html'), 'utf-8');
        const values = {
            title: lang === 'pl' ? 'Mój blog' : 'My Blog',
            subtitle: '',
            description: lang === 'pl' ? 'Spis wpisów na moim blogu.' : 'List of entries on my blog.',
            keywords: 'blog, kry008',
            cover_image: `${baseUrl}/images/logo.webp`,
            url: `${baseUrl}/blog/${lang}`,
            author: 'kry008',
            article: listHtml
        };

        const page = replacePlaceholders(template, values);
        res.send(page);
    } catch (e) {
        console.error(e);
        res.status(500).send('Błąd ładowania bloga.');
    }
});

app.get('/blog/:lang/:slug', (req, res) => {
    const { lang, slug } = req.params;
    const blogPath = path.join(__dirname, 'blog', slug);

    try {
        const config = JSON.parse(fs.readFileSync(path.join(blogPath, 'config.json'), 'utf-8'));
        if (config.visible === false) return res.status(404).send(`${lang == 'pl' ? 'Artykuł jest ukryty.' : 'Article is hidden.'}`);

        const content = fs.readFileSync(path.join(blogPath, `${lang}.html`), 'utf-8');
        const readingTime = getReadingTime(content);

        const template = fs.readFileSync(path.join(__dirname, 'blog/szablon.html'), 'utf-8');

        const values = {
            title: getConfigValue(config, 'title', lang),
            subtitle: getConfigValue(config, 'subtitle', lang),
            description: getConfigValue(config, 'description', lang),
            keywords: getConfigValue(config, 'keywords', lang),
            cover_image: getConfigValue(config, 'cover_image', lang),
            url: `${baseUrl}/blog/${lang}/${slug}`,
            author: config.author || 'kry008',
            article: content,
            reading_time: `${readingTime} min`

        };

        const page = replacePlaceholders(template, values);
        res.send(page);
    } catch (e) {
        console.error(e);
        res.status(404).send('Artykuł nie znaleziony.');
    }
});

app.get('/sitemap.xml', (req, res) => {
    const blogRoot = path.join(__dirname, 'blog');
    const now = new Date().toISOString();

    try {
        const folders = fs.readdirSync(blogRoot).filter(f => fs.lstatSync(path.join(blogRoot, f)).isDirectory());
        let urls = [
            { loc: `${baseUrl}/`, lastmod: now },
            { loc: `${baseUrl}/blog`, lastmod: now },
            { loc: `${baseUrl}/blog/pl`, lastmod: now },
            { loc: `${baseUrl}/blog/en`, lastmod: now }
        ];

        for (const folder of folders) {
            const slugPath = path.join(blogRoot, folder);
            const configPath = path.join(slugPath, 'config.json');

            if (!fs.existsSync(configPath)) continue;
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.visible === false) continue;

            const lastmod = config.date ? new Date(config.date).toISOString() : now;

            ['pl', 'en'].forEach(lang => {
                if (fs.existsSync(path.join(slugPath, `${lang}.html`))) {
                    urls.push({ loc: `${baseUrl}/blog/${lang}/${folder}`, lastmod });
                }
            });
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
            urls.map(u =>
                `<url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`
            ).join('\n') +
            `\n</urlset>`;

        res.set('Content-Type', 'application/xml');
        res.send(xml);
    } catch (e) {
        console.error(e);
        res.status(500).send('Błąd generowania mapy strony.');
    }
});
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});