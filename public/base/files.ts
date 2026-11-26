export const TEXT_EXT = /\.(txt|md)$/i;
export const BOARD_EXT = /\.svg$/i;
const SORTS: [string, RegExp][] = [['page', /\.html?$/i], ['image', /\.(png|jpe?g|gif|webp|bmp|svg)$/i], ['pdf', /\.pdf$/i]];
export const sortOf = (name: string) => SORTS.find(([, re]) => re.test(name || ''))?.[0] || 'other';
export const SAFE_OPEN = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|avif|heic|heif|psd|ai|eps|mp3|wav|ogg|oga|flac|m4a|aac|opus|wma|aiff?|midi?|mp4|m4v|mov|avi|mkv|webm|wmv|flv|ogv|pdf|epub|txt|md|markdown|rst|csv|tsv|log|json|ya?ml|toml|xml|rtf|docx|xlsx|pptx|odt|ods|odp|zip|7z|rar|tar|gz|tgz|bz2|xz|zst|ttf|otf|woff2?|fbx|obj|gltf|glb|stl|ply)$/i;
export const MAX_PATHS = 50;
