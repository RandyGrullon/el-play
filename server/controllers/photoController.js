const { getPhotoIndex, getPhotoFile } = require('../services/teamPhotos');

const getPhotos = async (req, res, next) => {
    try {
        const data = await getPhotoIndex();
        const empty = !Object.values(data.teams).some((files) => Object.keys(files).length);
        res.set('Cache-Control', empty ? 'public, max-age=0, s-maxage=300' : 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400');
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getPhoto = async (req, res, next) => {
    try {
        const photo = await getPhotoFile(req.params.teamId, req.params.file);
        if (!photo) {
            res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
            return res.status(404).json({ error: 'photo_not_found' });
        }
        // Las fotos casi no cambian: el CDN las guarda una semana
        res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');
        res.type(photo.type).send(photo.body);
    } catch (error) {
        next(error);
    }
};

module.exports = { getPhotos, getPhoto };
