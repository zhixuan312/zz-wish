import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Tile: Decodable {
    let source: String
    let output: String
    let rect: [Int]
    let sourceSize: [Int]
}

struct Pair: Decodable {
    let left: String
    let right: String
    let output: String
}

struct Work: Decodable {
    let tiles: [Tile]
    let pairs: [Pair]
}

enum PixelError: Error {
    case invalidImage(String)
    case invalidCrop(String)
    case invalidPixels(String)
    case cannotEncode(String)
}

let color = CGColorSpace(name: CGColorSpace.sRGB)!
let layout = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue

func open(_ path: String) throws -> CGImage {
    let url = URL(fileURLWithPath: path)
    guard let input = CGImageSourceCreateWithURL(url as CFURL, nil), CGImageSourceGetCount(input) == 1,
        let info = CGImageSourceCopyPropertiesAtIndex(input, 0, nil) as? [String: Any],
        (info[kCGImagePropertyOrientation as String] as? Int ?? 1) == 1,
        let image = CGImageSourceCreateImageAtIndex(input, 0, nil), image.bitsPerComponent == 8
    else { throw PixelError.invalidImage(path) }
    return image
}

func pixels(_ image: CGImage) throws -> Data {
    let stride = image.width * 4
    guard let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
        bytesPerRow: stride, space: color, bitmapInfo: layout), let raw = context.data
    else { throw PixelError.invalidPixels("Could not allocate a pixel buffer.") }
    context.interpolationQuality = .none
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return Data(bytes: raw, count: stride * image.height)
}

func encode(_ image: CGImage, at path: String) throws {
    let url = URL(fileURLWithPath: path)
    guard let out = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { throw PixelError.cannotEncode(path) }
    CGImageDestinationAddImage(out, image, nil)
    guard CGImageDestinationFinalize(out) else { throw PixelError.cannotEncode(path) }
}

func row(_ bytes: Data, y: Int, x: Int, width: Int, stride: Int) -> Data {
    let start = (y * stride + x) * 4
    return bytes.subdata(in: start..<(start + width * 4))
}

func encodePixels(_ rgba: Data, width: Int, height: Int, output: String) throws {
    guard let provider = CGDataProvider(data: rgba as CFData),
        let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: width * 4, space: color, bitmapInfo: CGBitmapInfo(rawValue: layout),
            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    else { throw PixelError.cannotEncode(output) }
    try encode(image, at: output)
    let decoded = try open(output)
    guard decoded.width == width, decoded.height == height, try pixels(decoded) == rgba
    else { throw PixelError.invalidPixels(output) }
}

func crop(_ tile: Tile) throws {
    let image = try open(tile.source)
    guard tile.rect.count == 4 else { throw PixelError.invalidCrop(tile.source) }
    let (x, y, width, height) = (tile.rect[0], tile.rect[1], tile.rect[2], tile.rect[3])
    guard tile.sourceSize == [image.width, image.height], x >= 0, y >= 0, width > 0, height > 0,
        x + width <= image.width, y + height <= image.height
    else { throw PixelError.invalidCrop(tile.source) }
    let source = try pixels(image)
    var cropped = Data(capacity: width * height * 4)
    for yOffset in 0..<height {
        cropped.append(row(source, y: y + yOffset, x: x, width: width, stride: image.width))
    }
    try encodePixels(cropped, width: width, height: height, output: tile.output)
}

func pair(_ spec: Pair) throws {
    let left = try open(spec.left), right = try open(spec.right)
    let w = left.width, h = left.height, gap = 16, width = 2 * w + gap
    guard [w, h] == [right.width, right.height] else { throw PixelError.invalidPixels(spec.output) }
    let lhs = try pixels(left), rhs = try pixels(right)
    let gutter = Data(Array(repeating: [UInt8(28), 28, 28, 255], count: gap).flatMap { $0 })
    var result = Data(capacity: width * h * 4)
    for y in 0..<h {
        result.append(row(lhs, y: y, x: 0, width: w, stride: w))
        result.append(gutter)
        result.append(row(rhs, y: y, x: 0, width: w, stride: w))
    }
    try encodePixels(result, width: width, height: h, output: spec.output)
}

do {
    let spec = URL(fileURLWithPath: CommandLine.arguments[1])
    let work = try JSONDecoder().decode(Work.self, from: Data(contentsOf: spec))
    for tile in work.tiles { try autoreleasepool { try crop(tile) } }
    for item in work.pairs { try autoreleasepool { try pair(item) } }
    print("Verified \(work.tiles.count) pixel-exact native crops and \(work.pairs.count) native side-by-sides.")
} catch {
    FileHandle.standardError.write(Data("Image verification failed: \(error)\n".utf8))
    exit(1)
}
